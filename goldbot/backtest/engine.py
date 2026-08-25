"""Event-driven backtester.

The contract with reality:

* A decision is made on the **close** of bar i and filled at the **open** of
  bar i+1. Nothing is ever filled at a price the bot could not have known.
* Intrabar, when both the stop and the target lie inside the bar's range, the
  **stop is assumed to fill first**. That is pessimistic by design; the
  optimistic assumption is what makes bad systems look profitable.
* Spread, commission, slippage and overnight swap are all charged.

Anything that makes the numbers look better than a live account would is a bug.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from ..core.features import FeatureConfig, MarketView, build_features
from ..core.types import (
    CONTRACT_SIZE,
    AccountState,
    Direction,
    ExitReason,
    Position,
    Side,
    Trade,
    TradePlan,
    round_lots,
    round_price,
)
from ..risk.manager import RiskManager
from ..risk.stops import manage_position
from ..strategies.ensemble import Ensemble, EnsembleDecision


@dataclass
class CostModel:
    """Execution costs. Defaults reflect a decent retail ECN gold account."""

    base_spread: float = 0.28
    commission_per_lot: float = 7.0  # round turn, per lot
    slippage: float = 0.05
    swap_long_per_lot: float = -3.5
    swap_short_per_lot: float = 0.5
    #: Spread multiplier by UTC hour — thin books cost more.
    session_spread_mult: dict[int, float] = field(
        default_factory=lambda: {
            **{h: 1.9 for h in (21, 22)},
            **{h: 1.35 for h in (23, 0, 1, 2, 3, 4, 5)},
            **{h: 1.0 for h in range(6, 21)},
        }
    )
    #: Extra spread when volatility is in the top decile.
    volatility_spread_mult: float = 1.6

    def spread_at(self, moment: datetime, atr_rank: float) -> float:
        mult = self.session_spread_mult.get(moment.hour, 1.0)
        if np.isfinite(atr_rank) and atr_rank > 0.9:
            mult *= self.volatility_spread_mult
        return self.base_spread * mult


@dataclass
class BacktestConfig:
    initial_balance: float = 10_000.0
    warmup_bars: int = 260
    costs: CostModel = field(default_factory=CostModel)
    #: Cancel a pending entry if the next open gaps this far past the plan.
    max_entry_slip_r: float = 0.5
    #: Re-size at fill so the risk budget survives a gap.
    resize_on_fill: bool = True
    #: Abandon a pending order if it was not filled on the very next bar.
    order_ttl_bars: int = 1
    record_equity: bool = True


@dataclass
class BacktestResult:
    trades: list[Trade]
    equity: pd.Series
    balance: pd.Series
    decisions: int
    entries: int
    rejections: dict[str, int]
    strategy_stats: dict[str, dict]
    config: BacktestConfig
    bars_in_market: int = 0
    total_bars: int = 0
    ended_halted: bool = False
    halt_reason: str = ""

    @property
    def final_equity(self) -> float:
        return float(self.equity.iloc[-1]) if len(self.equity) else 0.0


class Backtester:
    def __init__(
        self,
        ensemble: Ensemble,
        risk: RiskManager,
        config: Optional[BacktestConfig] = None,
        feature_config: Optional[FeatureConfig] = None,
    ) -> None:
        self.ensemble = ensemble
        self.risk = risk
        self.config = config or BacktestConfig()
        self.feature_config = feature_config or FeatureConfig()

    # ------------------------------------------------------------------
    def run(
        self,
        df: pd.DataFrame,
        features: Optional[pd.DataFrame] = None,
        progress: bool = False,
    ) -> BacktestResult:
        cfg = self.config
        costs = cfg.costs
        feat = features if features is not None else build_features(df, self.feature_config)

        balance = cfg.initial_balance
        positions: list[Position] = []
        trades: list[Trade] = []
        equity_curve = np.full(len(df), np.nan)
        balance_curve = np.full(len(df), np.nan)

        pending: Optional[tuple[TradePlan, int, EnsembleDecision]] = None
        decisions = 0
        entries = 0
        bars_in_market = 0
        last_day = None
        commission_paid = 0.0

        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        opens = df["open"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        index = df.index

        start = max(cfg.warmup_bars, 1)
        for i in range(start, len(df)):
            moment = index[i].to_pydatetime()
            view = MarketView(df, feat, i, spread=costs.base_spread)
            spread = costs.spread_at(moment, view.f("atr_rank"))

            # -- overnight financing on the day roll -----------------------
            day = index[i].date()
            if last_day is not None and day != last_day and positions:
                for position in positions:
                    rate = (
                        costs.swap_long_per_lot
                        if position.side is Side.BUY
                        else costs.swap_short_per_lot
                    )
                    balance += rate * position.lots
            last_day = day

            # -- 1. fill the order decided on the previous bar -------------
            if pending is not None:
                plan, age, decision = pending
                filled = self._try_fill(plan, opens[i], spread, moment, balance, view)
                if filled is not None:
                    position, cost = filled
                    balance -= cost
                    commission_paid += cost
                    positions.append(position)
                    self.risk.on_trade_opened()
                    entries += 1
                    pending = None
                elif age + 1 >= cfg.order_ttl_bars:
                    pending = None
                else:
                    pending = (plan, age + 1, decision)

            # -- 2. walk the bar for open positions ------------------------
            for position in list(positions):
                position.update_excursions(highs[i], lows[i])
                closed_now = self._walk_bar(
                    position, highs[i], lows[i], opens[i], moment, spread, costs
                )
                for trade, remaining in closed_now:
                    balance += trade.pnl
                    commission_paid += trade.commission
                    trades.append(trade)
                    self.risk.register_close(trade.pnl, i)
                    self.ensemble.on_trade_closed(position.contributors, trade.r_multiple)
                    if remaining <= 0:
                        positions.remove(position)

            # -- 3. manage survivors at the close --------------------------
            price = closes[i]
            for position in list(positions):
                position.bars_held += 1
                new_stop, actions = manage_position(position, view, self.risk.stops, price)
                for reason, fraction in actions:
                    if reason is ExitReason.PARTIAL_TP and position.partial_done:
                        continue
                    exit_price = self._exit_price(position, price, spread, costs)
                    trade, remaining = self._book(
                        position, position.lots * fraction, exit_price, reason, moment, costs
                    )
                    if trade is None:
                        continue
                    balance += trade.pnl
                    commission_paid += trade.commission
                    trades.append(trade)
                    self.risk.register_close(trade.pnl, i)
                    self.ensemble.on_trade_closed(position.contributors, trade.r_multiple)
                    if reason is ExitReason.PARTIAL_TP:
                        position.partial_done = True
                    if remaining <= 0 and position in positions:
                        positions.remove(position)
                if new_stop is not None and position in positions:
                    position.stop_loss = new_stop
                    position.breakeven_done = position.breakeven_done or (
                        (new_stop >= position.entry_price)
                        if position.side is Side.BUY
                        else (new_stop <= position.entry_price)
                    )

            # -- 4. equity mark-to-market ----------------------------------
            if positions:
                bars_in_market += 1
            unrealised = sum(p.unrealized(price) for p in positions)
            equity = balance + unrealised
            if cfg.record_equity:
                equity_curve[i] = equity
                balance_curve[i] = balance

            account = AccountState(
                balance=balance,
                equity=equity,
                open_positions=len(positions),
                margin_used=sum(p.lots * CONTRACT_SIZE * price / max(self.risk.config.leverage, 1) for p in positions),
            )
            self.risk.sync(moment, account, i)

            # -- 5. forced flat (weekend, kill switch, daily loss) ----------
            flatten, why = self._must_flatten(moment, account)
            if flatten and positions:
                reason = (
                    ExitReason.KILL_SWITCH
                    if why in {"halted", "daily_loss"}
                    else ExitReason.SESSION_END
                )
                for position in list(positions):
                    exit_price = self._exit_price(position, price, spread, costs)
                    trade, _ = self._book(
                        position, position.lots, exit_price, reason, moment, costs
                    )
                    if trade:
                        balance += trade.pnl
                        commission_paid += trade.commission
                        trades.append(trade)
                        self.risk.register_close(trade.pnl, i)
                        self.ensemble.on_trade_closed(position.contributors, trade.r_multiple)
                    positions.remove(position)
                pending = None

            if self.risk.state.halted:
                if cfg.record_equity:
                    equity_curve[i:] = equity
                    balance_curve[i:] = balance
                break

            # -- 6. decide for the next bar --------------------------------
            if pending is None and not flatten:
                decision = self.ensemble.evaluate(view)
                decisions += 1
                if decision.actionable:
                    flip_pnl, flip_commission = self._close_on_flip(
                        positions, decision, price, spread, costs, moment, trades, i
                    )
                    balance += flip_pnl
                    commission_paid += flip_commission
                    plan, why = self.risk.build_plan(
                        decision, view, account, positions, i, spread
                    )
                    if plan is not None:
                        pending = (plan, 0, decision)

            if progress and i % 5000 == 0:
                print(f"  bar {i}/{len(df)}  equity {equity:,.0f}")

        equity_series = pd.Series(equity_curve, index=index).ffill().fillna(cfg.initial_balance)
        balance_series = pd.Series(balance_curve, index=index).ffill().fillna(cfg.initial_balance)

        return BacktestResult(
            trades=trades,
            equity=equity_series,
            balance=balance_series,
            decisions=decisions,
            entries=entries,
            rejections=dict(self.risk.state.rejections),
            strategy_stats=self.ensemble.adaptive.snapshot(),
            config=cfg,
            bars_in_market=bars_in_market,
            total_bars=len(df) - start,
            ended_halted=self.risk.state.halted,
            halt_reason=self.risk.state.halt_reason,
        )

    # ------------------------------------------------------------------
    def _try_fill(
        self,
        plan: TradePlan,
        open_price: float,
        spread: float,
        moment: datetime,
        balance: float,
        view: MarketView,
    ) -> Optional[tuple[Position, float]]:
        costs = self.config.costs
        fill = (
            open_price + spread / 2.0 + costs.slippage
            if plan.side is Side.BUY
            else open_price - spread / 2.0 - costs.slippage
        )
        fill = round_price(fill)

        planned_risk = abs(plan.entry - plan.stop_loss)
        actual_risk = abs(fill - plan.stop_loss)
        if planned_risk <= 0 or actual_risk <= 0:
            return None
        # A gap through the level turns a good idea into a bad trade.
        adverse = (fill - plan.entry) * plan.side.sign
        if adverse > self.config.max_entry_slip_r * planned_risk:
            return None
        # Or straight past the stop.
        if (plan.side is Side.BUY and fill <= plan.stop_loss) or (
            plan.side is Side.SELL and fill >= plan.stop_loss
        ):
            return None

        lots = plan.lots
        if self.config.resize_on_fill:
            lots = round_lots(
                plan.risk_amount / (actual_risk * CONTRACT_SIZE),
                self.risk.config.lot_step,
                self.risk.config.min_lots,
            )
            if lots <= 0:
                return None

        commission = lots * costs.commission_per_lot / 2.0  # half in, half out
        position = Position(
            ticket=int(moment.timestamp()),
            side=plan.side,
            entry_price=fill,
            lots=lots,
            stop_loss=plan.stop_loss,
            take_profit=plan.take_profit,
            opened_at=moment,
            initial_lots=lots,
            initial_stop=plan.stop_loss,
            comment=plan.comment,
            contributors=dict(plan.contributors),
            meta={
                "confidence": plan.confidence,
                "regime": plan.regime.value,
                "partial_tp": plan.partial_tp,
            },
        )
        return position, commission

    def _walk_bar(
        self,
        position: Position,
        high: float,
        low: float,
        open_price: float,
        moment: datetime,
        spread: float,
        costs: CostModel,
    ) -> list[tuple[Trade, float]]:
        """Check stop and target against the bar's range. Stop wins ties."""
        results: list[tuple[Trade, float]] = []
        # Bid/ask: a long is stopped on the bid, a short on the ask.
        half = spread / 2.0
        if position.side is Side.BUY:
            worst, best = low - half, high - half
            stop_hit = worst <= position.stop_loss
            tp_hit = position.take_profit is not None and best >= position.take_profit
        else:
            worst, best = high + half, low + half
            stop_hit = worst >= position.stop_loss
            tp_hit = position.take_profit is not None and best <= position.take_profit

        if stop_hit:
            # Gap through the stop fills at the open, not at the level.
            fill = position.stop_loss
            gapped = (
                open_price - half < position.stop_loss
                if position.side is Side.BUY
                else open_price + half > position.stop_loss
            )
            if gapped:
                fill = open_price - half if position.side is Side.BUY else open_price + half
            fill -= costs.slippage * position.side.sign
            # A stop that has been moved is a trailing exit, not theoriginal stop —
            # keeping them apart is what makes the exit breakdown readable.
            reason = (
                ExitReason.STOP_LOSS
                if position.stop_loss == position.initial_stop
                else ExitReason.TRAILING_STOP
            )
            trade, remaining = self._book(
                position, position.lots, fill, reason, moment, costs
            )
            if trade:
                results.append((trade, remaining))
            return results

        if tp_hit and position.take_profit is not None:
            trade, remaining = self._book(
                position, position.lots, position.take_profit, ExitReason.TAKE_PROFIT, moment, costs
            )
            if trade:
                results.append((trade, remaining))
        return results

    @staticmethod
    def _exit_price(position: Position, mid: float, spread: float, costs: CostModel) -> float:
        half = spread / 2.0
        return (
            mid - half - costs.slippage
            if position.side is Side.BUY
            else mid + half + costs.slippage
        )

    def _book(
        self,
        position: Position,
        lots: float,
        price: float,
        reason: ExitReason,
        moment: datetime,
        costs: CostModel,
    ) -> tuple[Optional[Trade], float]:
        lots = round_lots(min(lots, position.lots), self.risk.config.lot_step, self.risk.config.min_lots)
        if lots <= 0:
            return None, position.lots
        pnl = (price - position.entry_price) * position.side.sign * lots * CONTRACT_SIZE
        commission = lots * costs.commission_per_lot / 2.0
        risk = position.initial_risk_per_unit
        remaining = round_lots(position.lots - lots, self.risk.config.lot_step, 0.0)

        trade = Trade(
            ticket=position.ticket,
            side=position.side,
            lots=lots,
            entry_price=position.entry_price,
            exit_price=round_price(price),
            opened_at=position.opened_at,
            closed_at=moment,
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
        position.lots = remaining
        position.realized_pnl += trade.pnl
        return trade, remaining

    def _must_flatten(self, moment: datetime, account: AccountState) -> tuple[bool, str]:
        if self.risk.state.halted:
            return True, "halted"
        flat, why = self.risk.sessions.must_flatten(moment)
        if flat:
            return True, why
        if self.risk.daily_pnl_pct() <= -self.risk.config.max_daily_loss:
            return True, "daily_loss"
        return False, ""

    def _close_on_flip(
        self,
        positions: list[Position],
        decision: EnsembleDecision,
        price: float,
        spread: float,
        costs: CostModel,
        moment: datetime,
        trades: list[Trade],
        bar_index: int,
    ) -> tuple[float, float]:
        """Exit a position the committee has turned against. Returns
        (realised pnl, commission) for the caller to apply to the balance."""
        stops = self.risk.stops
        realised = 0.0
        commission = 0.0
        if not stops.exit_on_flip or decision.confidence < stops.flip_confidence:
            return realised, commission
        wanted = Side.BUY if decision.direction is Direction.LONG else Side.SELL
        for position in list(positions):
            if position.side is wanted:
                continue
            exit_price = self._exit_price(position, price, spread, costs)
            trade, _ = self._book(
                position, position.lots, exit_price, ExitReason.SIGNAL_FLIP, moment, costs
            )
            if trade:
                trades.append(trade)
                realised += trade.pnl
                commission += trade.commission
                self.risk.register_close(trade.pnl, bar_index)
                self.ensemble.on_trade_closed(position.contributors, trade.r_multiple)
            positions.remove(position)
        return realised, commission
