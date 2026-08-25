"""Broker abstraction plus a paper implementation.

The engine only ever talks to this interface, so the same code path runs
against a simulated account, an MT5 terminal or OANDA's REST API. Anything a
real broker can refuse — a rejected order, a moved price, a partial fill — has
to be expressible here, which is why `open` returns Optional and `close`
returns the realised Trade rather than a bool.
"""

from __future__ import annotations

import itertools
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional

from ..core.types import (
    CONTRACT_SIZE,
    AccountState,
    ExitReason,
    Position,
    Side,
    Tick,
    Trade,
    TradePlan,
    round_lots,
    round_price,
    utcnow,
)


class Broker(ABC):
    symbol: str = "XAUUSD"

    @abstractmethod
    def account(self) -> AccountState:
        ...

    @abstractmethod
    def positions(self) -> list[Position]:
        ...

    @abstractmethod
    def tick(self) -> Tick:
        ...

    @abstractmethod
    def open(self, plan: TradePlan) -> Optional[Position]:
        ...

    @abstractmethod
    def modify(
        self,
        position: Position,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        ...

    @abstractmethod
    def close(
        self,
        position: Position,
        fraction: float = 1.0,
        reason: ExitReason = ExitReason.MANUAL,
    ) -> Optional[Trade]:
        ...

    def close_all(self, reason: ExitReason = ExitReason.MANUAL) -> list[Trade]:
        closed = []
        for position in list(self.positions()):
            trade = self.close(position, 1.0, reason)
            if trade:
                closed.append(trade)
        return closed

    def sync(self) -> None:
        """Refresh cached broker state. Called once per engine cycle."""
        return None

    def shutdown(self) -> None:
        return None


class PaperBroker(Broker):
    """In-memory account for dry runs and for the live engine's paper mode.

    Fills happen at the quoted bid/ask plus configured slippage, stops and
    targets are evaluated on every price update, and commission and swap are
    charged the way a real gold account charges them. It is deliberately
    pessimistic: a paper run that looks worse than reality is safe, the
    reverse is not.
    """

    def __init__(
        self,
        balance: float = 10_000.0,
        symbol: str = "XAUUSD",
        spread: float = 0.30,
        commission_per_lot: float = 7.0,
        slippage: float = 0.05,
        swap_long_per_lot: float = -3.5,
        swap_short_per_lot: float = 0.5,
    ) -> None:
        self.symbol = symbol
        self.balance = float(balance)
        self.spread = spread
        self.commission_per_lot = commission_per_lot
        self.slippage = slippage
        self.swap_long_per_lot = swap_long_per_lot
        self.swap_short_per_lot = swap_short_per_lot

        self._positions: dict[int, Position] = {}
        self._tickets = itertools.count(1)
        self._price: float = 0.0
        self._time: datetime = utcnow()
        self.closed_trades: list[Trade] = []
        self.commission_paid: float = 0.0

    # -- market state ------------------------------------------------------
    def update_price(self, price: float, moment: Optional[datetime] = None) -> list[Trade]:
        """Feed a new mid price. Returns any trades closed by stop or target."""
        self._price = float(price)
        self._time = moment or utcnow()
        return self._check_exits()

    def tick(self) -> Tick:
        half = self.spread / 2.0
        return Tick(self._time, round_price(self._price - half), round_price(self._price + half))

    def account(self) -> AccountState:
        unrealised = sum(p.unrealized(self._exit_price(p)) for p in self._positions.values())
        margin = sum(p.lots * CONTRACT_SIZE * self._price / 100.0 for p in self._positions.values())
        return AccountState(
            balance=round(self.balance, 2),
            equity=round(self.balance + unrealised, 2),
            open_positions=len(self._positions),
            margin_used=round(margin, 2),
        )

    def positions(self) -> list[Position]:
        return list(self._positions.values())

    # -- orders ------------------------------------------------------------
    def open(self, plan: TradePlan) -> Optional[Position]:
        if plan.lots <= 0 or self._price <= 0:
            return None
        tick = self.tick()
        fill = tick.ask + self.slippage if plan.side is Side.BUY else tick.bid - self.slippage
        position = Position(
            ticket=next(self._tickets),
            side=plan.side,
            entry_price=round_price(fill),
            lots=plan.lots,
            stop_loss=plan.stop_loss,
            take_profit=plan.take_profit,
            opened_at=self._time,
            initial_lots=plan.lots,
            initial_stop=plan.stop_loss,
            comment=plan.comment,
            contributors=dict(plan.contributors),
            meta={
                "partial_tp": plan.partial_tp,
                "partial_fraction": plan.partial_fraction,
                "confidence": plan.confidence,
                "regime": plan.regime.value,
            },
        )
        commission = plan.lots * self.commission_per_lot
        self.balance -= commission
        self.commission_paid += commission
        position.realized_pnl -= commission
        self._positions[position.ticket] = position
        return position

    def modify(
        self,
        position: Position,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        live = self._positions.get(position.ticket)
        if live is None:
            return False
        if stop_loss is not None:
            live.stop_loss = round_price(stop_loss)
        if take_profit is not None:
            live.take_profit = round_price(take_profit)
        return True

    def close(
        self,
        position: Position,
        fraction: float = 1.0,
        reason: ExitReason = ExitReason.MANUAL,
    ) -> Optional[Trade]:
        live = self._positions.get(position.ticket)
        if live is None:
            return None
        fraction = max(0.0, min(1.0, fraction))
        lots = round_lots(live.lots * fraction, 0.01, 0.01) if fraction < 1.0 else live.lots
        if lots <= 0:
            return None
        price = self._exit_price(live)
        return self._book(live, lots, price, reason)

    # -- internals ---------------------------------------------------------
    def _exit_price(self, position: Position) -> float:
        tick = self.tick()
        return (
            tick.bid - self.slippage
            if position.side is Side.BUY
            else tick.ask + self.slippage
        )

    def _check_exits(self) -> list[Trade]:
        closed: list[Trade] = []
        for position in list(self._positions.values()):
            price = self._exit_price(position)
            position.update_excursions(price, price)
            hit_stop = (
                price <= position.stop_loss
                if position.side is Side.BUY
                else price >= position.stop_loss
            )
            if hit_stop:
                reason = (
                    ExitReason.STOP_LOSS
                    if position.stop_loss == position.initial_stop
                    else ExitReason.TRAILING_STOP
                )
                closed.append(
                    self._book(position, position.lots, position.stop_loss, reason)
                )
                continue
            if position.take_profit is not None:
                hit_tp = (
                    price >= position.take_profit
                    if position.side is Side.BUY
                    else price <= position.take_profit
                )
                if hit_tp:
                    closed.append(
                        self._book(position, position.lots, position.take_profit, ExitReason.TAKE_PROFIT)
                    )
        return [t for t in closed if t is not None]

    def _book(
        self, position: Position, lots: float, price: float, reason: ExitReason
    ) -> Trade:
        pnl = (price - position.entry_price) * position.side.sign * lots * CONTRACT_SIZE
        commission = lots * self.commission_per_lot
        self.balance += pnl - commission
        self.commission_paid += commission
        position.realized_pnl += pnl - commission

        remaining = round_lots(position.lots - lots, 0.01, 0.0)
        risk = position.initial_risk_per_unit
        trade = Trade(
            ticket=position.ticket,
            side=position.side,
            lots=lots,
            entry_price=position.entry_price,
            exit_price=round_price(price),
            opened_at=position.opened_at,
            closed_at=self._time,
            pnl=round(pnl - commission, 2),
            r_multiple=round(
                (price - position.entry_price)
                * position.side.sign
                / risk
                * (lots / position.initial_lots),
                4,
            )
            if risk > 0 and position.initial_lots > 0
            else 0.0,
            exit_reason=reason,
            initial_stop=position.initial_stop,
            bars_held=position.bars_held,
            commission=commission,
            max_favourable=position.max_favourable,
            max_adverse=position.max_adverse,
            regime=str(position.meta.get("regime", "")),
            confidence=float(position.meta.get("confidence", 0.0) or 0.0),
            contributors=dict(position.contributors),
            comment=position.comment,
        )
        self.closed_trades.append(trade)

        if remaining <= 0:
            self._positions.pop(position.ticket, None)
        else:
            position.lots = remaining
            if reason is ExitReason.PARTIAL_TP:
                position.partial_done = True
        return trade

    def charge_swap(self, nights: int = 1) -> float:
        """Apply overnight financing. Gold longs pay, shorts usually earn a little."""
        total = 0.0
        for position in self._positions.values():
            rate = (
                self.swap_long_per_lot
                if position.side is Side.BUY
                else self.swap_short_per_lot
            )
            total += rate * position.lots * nights
        self.balance += total
        return total
