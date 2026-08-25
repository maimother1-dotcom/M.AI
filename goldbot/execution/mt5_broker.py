"""MetaTrader 5 execution.

Real money moves through this file, so every order goes out with an explicit
filling mode, a deviation cap and a magic number, and every result code is
checked. Silence is never treated as success.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
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
from ..data.mt5_feed import connect
from .broker import Broker

#: Tags every order this bot places, so manual trades on the same account are
#: never touched by the position manager.
MAGIC = 20260825


class MT5Broker(Broker):
    def __init__(
        self,
        symbol: str = "XAUUSD",
        login: Optional[int] = None,
        password: Optional[str] = None,
        server: Optional[str] = None,
        path: Optional[str] = None,
        deviation: int = 20,
        magic: int = MAGIC,
        max_retries: int = 3,
    ) -> None:
        self.mt5 = connect(login, password, server, path)
        self.symbol = self._resolve_symbol(symbol)
        self.deviation = deviation
        self.magic = magic
        self.max_retries = max_retries
        self.info = self.mt5.symbol_info(self.symbol)
        if self.info is None:
            raise RuntimeError(f"symbol {self.symbol} unavailable")
        self._entry_meta: dict[int, dict] = {}
        self.closed_trades: list[Trade] = []

    # -- setup -------------------------------------------------------------
    def _resolve_symbol(self, symbol: str) -> str:
        if self.mt5.symbol_info(symbol) is not None:
            self.mt5.symbol_select(symbol, True)
            return symbol
        for pattern in ("*XAU*", "*GOLD*"):
            for info in self.mt5.symbols_get(pattern) or []:
                self.mt5.symbol_select(info.name, True)
                return info.name
        raise RuntimeError(f"no gold symbol matching {symbol}")

    @property
    def lot_step(self) -> float:
        return float(getattr(self.info, "volume_step", 0.01) or 0.01)

    @property
    def min_lot(self) -> float:
        return float(getattr(self.info, "volume_min", 0.01) or 0.01)

    @property
    def stops_level(self) -> float:
        """Broker's minimum stop distance, in price units."""
        points = float(getattr(self.info, "trade_stops_level", 0) or 0)
        point = float(getattr(self.info, "point", 0.01) or 0.01)
        return points * point

    def _filling_mode(self):
        """Pick a filling mode the symbol actually accepts. Getting this wrong
        is the single most common cause of `Unsupported filling mode`."""
        mode = int(getattr(self.info, "filling_mode", 0) or 0)
        if mode & 1:
            return self.mt5.ORDER_FILLING_FOK
        if mode & 2:
            return self.mt5.ORDER_FILLING_IOC
        return self.mt5.ORDER_FILLING_RETURN

    # -- state -------------------------------------------------------------
    def sync(self) -> None:
        self.info = self.mt5.symbol_info(self.symbol) or self.info

    def account(self) -> AccountState:
        info = self.mt5.account_info()
        if info is None:
            raise RuntimeError(f"account_info failed: {self.mt5.last_error()}")
        return AccountState(
            balance=float(info.balance),
            equity=float(info.equity),
            open_positions=len(self.positions()),
            margin_used=float(info.margin),
        )

    def tick(self) -> Tick:
        quote = self.mt5.symbol_info_tick(self.symbol)
        if quote is None:
            raise RuntimeError(f"no tick for {self.symbol}: {self.mt5.last_error()}")
        return Tick(utcnow(), float(quote.bid), float(quote.ask))

    def positions(self) -> list[Position]:
        raw = self.mt5.positions_get(symbol=self.symbol) or []
        out: list[Position] = []
        for item in raw:
            if item.magic != self.magic:
                continue  # someone else's trade; hands off
            meta = self._entry_meta.get(item.ticket, {})
            position = Position(
                ticket=int(item.ticket),
                side=Side.BUY if item.type == self.mt5.POSITION_TYPE_BUY else Side.SELL,
                entry_price=float(item.price_open),
                lots=float(item.volume),
                stop_loss=float(item.sl) if item.sl else float(meta.get("initial_stop", 0.0)),
                take_profit=float(item.tp) if item.tp else None,
                opened_at=datetime.fromtimestamp(int(item.time), tz=timezone.utc),
                initial_lots=float(meta.get("initial_lots", item.volume)),
                initial_stop=float(meta.get("initial_stop", item.sl or item.price_open)),
                partial_done=bool(meta.get("partial_done", False)),
                breakeven_done=bool(meta.get("breakeven_done", False)),
                bars_held=int(meta.get("bars_held", 0)),
                comment=str(item.comment or ""),
                contributors=dict(meta.get("contributors", {})),
                meta=dict(meta),
            )
            out.append(position)
        return out

    # -- orders ------------------------------------------------------------
    def open(self, plan: TradePlan) -> Optional[Position]:
        lots = round_lots(plan.lots, self.lot_step, self.min_lot)
        if lots <= 0:
            return None

        quote = self.tick()
        price = quote.ask if plan.side is Side.BUY else quote.bid
        stop, target = self._respect_stops_level(plan.side, price, plan.stop_loss, plan.take_profit)

        request = {
            "action": self.mt5.TRADE_ACTION_DEAL,
            "symbol": self.symbol,
            "volume": lots,
            "type": self.mt5.ORDER_TYPE_BUY if plan.side is Side.BUY else self.mt5.ORDER_TYPE_SELL,
            "price": price,
            "sl": stop,
            "tp": target if target else 0.0,
            "deviation": self.deviation,
            "magic": self.magic,
            "comment": plan.comment[:31],
            "type_time": self.mt5.ORDER_TIME_GTC,
            "type_filling": self._filling_mode(),
        }
        result = self._send(request)
        if result is None:
            return None

        ticket = int(getattr(result, "order", 0) or 0)
        # The deal ticket is not the position ticket; find the position we just made.
        position = None
        for candidate in self.positions():
            if candidate.ticket == ticket or candidate.opened_at >= quote.time:
                position = candidate
                break
        if position is None:
            positions = self.positions()
            position = positions[-1] if positions else None
        if position is None:
            return None

        self._entry_meta[position.ticket] = {
            "initial_lots": lots,
            "initial_stop": stop,
            "partial_tp": plan.partial_tp,
            "partial_fraction": plan.partial_fraction,
            "confidence": plan.confidence,
            "regime": plan.regime.value,
            "contributors": dict(plan.contributors),
            "bars_held": 0,
            "partial_done": False,
            "breakeven_done": False,
        }
        position.initial_lots = lots
        position.initial_stop = stop
        position.contributors = dict(plan.contributors)
        position.meta = dict(self._entry_meta[position.ticket])
        return position

    def modify(
        self,
        position: Position,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        quote = self.tick()
        price = quote.bid if position.side is Side.BUY else quote.ask
        stop, target = self._respect_stops_level(
            position.side,
            price,
            stop_loss if stop_loss is not None else position.stop_loss,
            take_profit if take_profit is not None else position.take_profit,
        )
        request = {
            "action": self.mt5.TRADE_ACTION_SLTP,
            "symbol": self.symbol,
            "position": position.ticket,
            "sl": stop,
            "tp": target if target else 0.0,
            "magic": self.magic,
        }
        result = self._send(request)
        if result is None:
            return False
        position.stop_loss = stop
        if target:
            position.take_profit = target
        meta = self._entry_meta.setdefault(position.ticket, {})
        meta["last_stop"] = stop
        return True

    def close(
        self,
        position: Position,
        fraction: float = 1.0,
        reason: ExitReason = ExitReason.MANUAL,
    ) -> Optional[Trade]:
        fraction = max(0.0, min(1.0, fraction))
        lots = (
            position.lots
            if fraction >= 1.0
            else round_lots(position.lots * fraction, self.lot_step, self.min_lot)
        )
        if lots <= 0:
            return None

        quote = self.tick()
        price = quote.bid if position.side is Side.BUY else quote.ask
        request = {
            "action": self.mt5.TRADE_ACTION_DEAL,
            "symbol": self.symbol,
            "position": position.ticket,
            "volume": lots,
            "type": self.mt5.ORDER_TYPE_SELL
            if position.side is Side.BUY
            else self.mt5.ORDER_TYPE_BUY,
            "price": price,
            "deviation": self.deviation,
            "magic": self.magic,
            "comment": reason.value[:31],
            "type_time": self.mt5.ORDER_TIME_GTC,
            "type_filling": self._filling_mode(),
        }
        result = self._send(request)
        if result is None:
            return None

        fill = float(getattr(result, "price", price) or price)
        risk = position.initial_risk_per_unit
        pnl = (fill - position.entry_price) * position.side.sign * lots * CONTRACT_SIZE
        trade = Trade(
            ticket=position.ticket,
            side=position.side,
            lots=lots,
            entry_price=position.entry_price,
            exit_price=round_price(fill),
            opened_at=position.opened_at,
            closed_at=utcnow(),
            pnl=round(pnl, 2),
            r_multiple=round(
                (fill - position.entry_price)
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
            max_favourable=position.max_favourable,
            max_adverse=position.max_adverse,
            regime=str(position.meta.get("regime", "")),
            confidence=float(position.meta.get("confidence", 0.0) or 0.0),
            contributors=dict(position.contributors),
            comment=position.comment,
        )
        self.closed_trades.append(trade)
        if fraction >= 1.0:
            self._entry_meta.pop(position.ticket, None)
        else:
            meta = self._entry_meta.setdefault(position.ticket, {})
            if reason is ExitReason.PARTIAL_TP:
                meta["partial_done"] = True
        return trade

    def remember(self, ticket: int, **fields) -> None:
        """Persist bot-side position state MT5 does not store for us."""
        self._entry_meta.setdefault(ticket, {}).update(fields)

    # -- plumbing ----------------------------------------------------------
    def _respect_stops_level(
        self,
        side: Side,
        price: float,
        stop: Optional[float],
        target: Optional[float],
    ) -> tuple[float, Optional[float]]:
        """Push stops out to the broker's minimum distance rather than letting
        the order be rejected outright."""
        minimum = max(self.stops_level, 0.0)
        stop_value = float(stop or 0.0)
        if stop_value:
            if side is Side.BUY:
                stop_value = min(stop_value, price - minimum)
            else:
                stop_value = max(stop_value, price + minimum)
        target_value = float(target or 0.0)
        if target_value:
            if side is Side.BUY:
                target_value = max(target_value, price + minimum)
            else:
                target_value = min(target_value, price - minimum)
        return round_price(stop_value), (round_price(target_value) if target_value else None)

    def _send(self, request: dict):
        """Send with retries on the transient codes; give up loudly otherwise."""
        retryable = {
            self.mt5.TRADE_RETCODE_REQUOTE,
            self.mt5.TRADE_RETCODE_PRICE_OFF,
            self.mt5.TRADE_RETCODE_PRICE_CHANGED,
            self.mt5.TRADE_RETCODE_TIMEOUT,
            self.mt5.TRADE_RETCODE_CONNECTION,
        }
        last = None
        for attempt in range(self.max_retries):
            result = self.mt5.order_send(request)
            last = result
            if result is None:
                time.sleep(0.5 * (attempt + 1))
                continue
            if result.retcode == self.mt5.TRADE_RETCODE_DONE:
                return result
            if result.retcode in retryable:
                quote = self.tick()
                if request.get("action") == self.mt5.TRADE_ACTION_DEAL:
                    is_buy = request["type"] == self.mt5.ORDER_TYPE_BUY
                    request["price"] = quote.ask if is_buy else quote.bid
                time.sleep(0.4 * (attempt + 1))
                continue
            raise RuntimeError(
                f"order rejected: retcode={result.retcode} {result.comment}"
            )
        raise RuntimeError(f"order failed after {self.max_retries} attempts: {last}")

    def shutdown(self) -> None:
        try:
            self.mt5.shutdown()
        except Exception:  # pragma: no cover
            pass
