"""OANDA v20 execution.

Cross-platform live trading without MetaTrader. OANDA quotes XAU_USD in units
of one ounce, so the bot's lots are converted at the boundary: 1 lot = 100
units. Stops and targets go out attached to the order itself, which means a
dropped connection cannot leave a naked position.
"""

from __future__ import annotations

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
    as_utc,
    round_price,
    utcnow,
)
from ..data.oanda_feed import OandaClient
from .broker import Broker


def _parse_time(value: str) -> datetime:
    # v20 returns nanosecond precision, which fromisoformat cannot parse.
    cleaned = value.replace("Z", "+00:00")
    if "." in cleaned:
        head, tail = cleaned.split(".", 1)
        offset = tail[-6:] if "+" in tail or "-" in tail[1:] else "+00:00"
        cleaned = f"{head}.{tail[:6].rstrip('+-0123456789:')[:6] or '0'}{offset}"
    try:
        return as_utc(datetime.fromisoformat(cleaned))
    except ValueError:
        return utcnow()


class OandaBroker(Broker):
    def __init__(
        self,
        client: OandaClient,
        symbol: str = "XAU_USD",
        units_per_lot: float = CONTRACT_SIZE,
    ) -> None:
        self.client = client
        self.symbol = symbol
        self.units_per_lot = units_per_lot
        self._meta: dict[int, dict] = {}
        self.closed_trades: list[Trade] = []

    # -- state -------------------------------------------------------------
    def account(self) -> AccountState:
        payload = self.client.request("GET", f"/v3/accounts/{self.client.account_id}/summary")
        summary = payload.get("account", {})
        return AccountState(
            balance=float(summary.get("balance", 0.0)),
            equity=float(summary.get("NAV", summary.get("balance", 0.0))),
            open_positions=int(summary.get("openTradeCount", 0)),
            margin_used=float(summary.get("marginUsed", 0.0)),
        )

    def tick(self) -> Tick:
        payload = self.client.request(
            "GET",
            f"/v3/accounts/{self.client.account_id}/pricing",
            params={"instruments": self.symbol},
        )
        prices = payload.get("prices", [])
        if not prices:
            raise RuntimeError("OANDA pricing returned nothing")
        quote = prices[0]
        return Tick(
            utcnow(),
            float(quote["bids"][0]["price"]),
            float(quote["asks"][0]["price"]),
        )

    def positions(self) -> list[Position]:
        payload = self.client.request(
            "GET",
            f"/v3/accounts/{self.client.account_id}/openTrades",
        )
        out: list[Position] = []
        for trade in payload.get("trades", []):
            if trade.get("instrument") != self.symbol:
                continue
            units = float(trade["currentUnits"])
            ticket = int(trade["id"])
            meta = self._meta.get(ticket, {})
            stop = trade.get("stopLossOrder", {}).get("price")
            target = trade.get("takeProfitOrder", {}).get("price")
            position = Position(
                ticket=ticket,
                side=Side.BUY if units > 0 else Side.SELL,
                entry_price=float(trade["price"]),
                lots=abs(units) / self.units_per_lot,
                stop_loss=float(stop) if stop else float(meta.get("initial_stop", 0.0)),
                take_profit=float(target) if target else None,
                opened_at=_parse_time(trade["openTime"]),
                initial_lots=float(meta.get("initial_lots", abs(units) / self.units_per_lot)),
                initial_stop=float(meta.get("initial_stop", stop or trade["price"])),
                partial_done=bool(meta.get("partial_done", False)),
                breakeven_done=bool(meta.get("breakeven_done", False)),
                bars_held=int(meta.get("bars_held", 0)),
                contributors=dict(meta.get("contributors", {})),
                meta=dict(meta),
            )
            out.append(position)
        return out

    # -- orders ------------------------------------------------------------
    def open(self, plan: TradePlan) -> Optional[Position]:
        units = int(round(plan.lots * self.units_per_lot)) * plan.side.sign
        if units == 0:
            return None
        order = {
            "order": {
                "type": "MARKET",
                "instrument": self.symbol,
                "units": str(units),
                "timeInForce": "FOK",
                "positionFill": "DEFAULT",
                "stopLossOnFill": {"price": f"{plan.stop_loss:.2f}", "timeInForce": "GTC"},
            }
        }
        if plan.take_profit:
            order["order"]["takeProfitOnFill"] = {
                "price": f"{plan.take_profit:.2f}",
                "timeInForce": "GTC",
            }
        payload = self.client.request(
            "POST", f"/v3/accounts/{self.client.account_id}/orders", body=order
        )
        fill = payload.get("orderFillTransaction")
        if not fill:
            reject = payload.get("orderRejectTransaction") or payload.get("orderCancelTransaction")
            raise RuntimeError(f"OANDA rejected the order: {reject}")

        opened = fill.get("tradeOpened") or {}
        ticket = int(opened.get("tradeID", fill.get("id", 0)))
        self._meta[ticket] = {
            "initial_lots": plan.lots,
            "initial_stop": plan.stop_loss,
            "partial_tp": plan.partial_tp,
            "partial_fraction": plan.partial_fraction,
            "confidence": plan.confidence,
            "regime": plan.regime.value,
            "contributors": dict(plan.contributors),
            "bars_held": 0,
            "partial_done": False,
            "breakeven_done": False,
        }
        return Position(
            ticket=ticket,
            side=plan.side,
            entry_price=float(fill.get("price", plan.entry)),
            lots=abs(float(opened.get("units", units))) / self.units_per_lot,
            stop_loss=plan.stop_loss,
            take_profit=plan.take_profit,
            opened_at=_parse_time(fill.get("time", "")),
            initial_lots=plan.lots,
            initial_stop=plan.stop_loss,
            comment=plan.comment,
            contributors=dict(plan.contributors),
            meta=dict(self._meta[ticket]),
        )

    def modify(
        self,
        position: Position,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        body: dict = {}
        if stop_loss is not None:
            body["stopLoss"] = {"price": f"{stop_loss:.2f}", "timeInForce": "GTC"}
        if take_profit is not None:
            body["takeProfit"] = {"price": f"{take_profit:.2f}", "timeInForce": "GTC"}
        if not body:
            return False
        self.client.request(
            "PUT",
            f"/v3/accounts/{self.client.account_id}/trades/{position.ticket}/orders",
            body=body,
        )
        if stop_loss is not None:
            position.stop_loss = round_price(stop_loss)
        if take_profit is not None:
            position.take_profit = round_price(take_profit)
        return True

    def close(
        self,
        position: Position,
        fraction: float = 1.0,
        reason: ExitReason = ExitReason.MANUAL,
    ) -> Optional[Trade]:
        fraction = max(0.0, min(1.0, fraction))
        if fraction >= 1.0:
            body = {"units": "ALL"}
            lots = position.lots
        else:
            units = int(round(position.lots * fraction * self.units_per_lot))
            if units <= 0:
                return None
            body = {"units": str(units)}
            lots = units / self.units_per_lot
        payload = self.client.request(
            "PUT",
            f"/v3/accounts/{self.client.account_id}/trades/{position.ticket}/close",
            body=body,
        )
        fill = payload.get("orderFillTransaction")
        if not fill:
            raise RuntimeError(f"OANDA close failed: {payload}")

        price = float(fill.get("price", position.entry_price))
        pnl = float(fill.get("pl", 0.0)) or (
            (price - position.entry_price) * position.side.sign * lots * CONTRACT_SIZE
        )
        risk = position.initial_risk_per_unit
        trade = Trade(
            ticket=position.ticket,
            side=position.side,
            lots=lots,
            entry_price=position.entry_price,
            exit_price=round_price(price),
            opened_at=position.opened_at,
            closed_at=_parse_time(fill.get("time", "")),
            pnl=round(pnl, 2),
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
            commission=abs(float(fill.get("commission", 0.0))),
            max_favourable=position.max_favourable,
            max_adverse=position.max_adverse,
            regime=str(position.meta.get("regime", "")),
            confidence=float(position.meta.get("confidence", 0.0) or 0.0),
            contributors=dict(position.contributors),
            comment=position.comment,
        )
        self.closed_trades.append(trade)
        if fraction >= 1.0:
            self._meta.pop(position.ticket, None)
        elif reason is ExitReason.PARTIAL_TP:
            self._meta.setdefault(position.ticket, {})["partial_done"] = True
        return trade

    def remember(self, ticket: int, **fields) -> None:
        self._meta.setdefault(ticket, {}).update(fields)
