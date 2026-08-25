"""Risk manager — the only component allowed to say "yes, trade this size".

Every rule here exists to answer one question: what is the largest position I
can take such that a string of losses cannot end the account? Nothing in the
strategy layer can override it, and every refusal is recorded with a reason so
a quiet day can be explained rather than guessed at.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from ..core.features import MarketView
from ..core.types import (
    CONTRACT_SIZE,
    AccountState,
    Direction,
    Position,
    Side,
    TradePlan,
    as_utc,
    round_lots,
    round_price,
)
from ..strategies.ensemble import EnsembleDecision
from . import stops as stop_rules
from .sessions import SessionPolicy


@dataclass
class RiskConfig:
    #: Fraction of equity risked per trade at full confidence.
    risk_per_trade: float = 0.005
    #: Scale size with ensemble confidence between these bounds.
    confidence_scaling: bool = True
    min_size_factor: float = 0.5
    max_size_factor: float = 1.25
    #: Hard caps.
    max_lots: float = 5.0
    min_lots: float = 0.01
    lot_step: float = 0.01
    max_open_positions: int = 2
    allow_hedging: bool = False
    max_trades_per_day: int = 6
    #: Loss controls, as fractions of the day's starting balance / peak equity.
    max_daily_loss: float = 0.03
    max_daily_profit_lock: float = 0.06
    max_drawdown: float = 0.15
    consecutive_loss_pause: int = 3
    pause_bars: int = 12
    #: Execution-quality filters.
    max_spread: float = 0.60
    min_stop_distance: float = 0.80
    min_reward_risk: float = 1.2
    #: Leverage / margin guard.
    leverage: int = 100
    max_margin_utilisation: float = 0.25
    #: Reduce size after a losing streak (Kelly-style de-risking).
    streak_derisk: bool = True


@dataclass
class RiskState:
    day: Optional[date] = None
    day_start_balance: float = 0.0
    day_realised: float = 0.0
    trades_today: int = 0
    consecutive_losses: int = 0
    peak_equity: float = 0.0
    pause_until_bar: int = -1
    halted: bool = False
    halt_reason: str = ""
    rejections: dict[str, int] = field(default_factory=dict)

    def note(self, reason: str) -> None:
        key = reason.split(":")[0]
        self.rejections[key] = self.rejections.get(key, 0) + 1


class RiskManager:
    def __init__(
        self,
        config: Optional[RiskConfig] = None,
        stop_config: Optional[stop_rules.StopConfig] = None,
        session_policy: Optional[SessionPolicy] = None,
    ) -> None:
        self.config = config or RiskConfig()
        self.stops = stop_config or stop_rules.StopConfig()
        self.sessions = session_policy or SessionPolicy()
        self.state = RiskState()

    # -- day / equity bookkeeping ----------------------------------------
    def sync(self, moment: datetime, account: AccountState, bar_index: int = 0) -> None:
        today = as_utc(moment).date()
        if self.state.day != today:
            self.state.day = today
            self.state.day_start_balance = account.balance
            self.state.day_realised = 0.0
            self.state.trades_today = 0
        self.state.peak_equity = max(self.state.peak_equity, account.equity, account.balance)

        drawdown = 0.0
        if self.state.peak_equity > 0:
            drawdown = 1.0 - account.equity / self.state.peak_equity
        if drawdown >= self.config.max_drawdown and not self.state.halted:
            self.state.halted = True
            self.state.halt_reason = (
                f"max drawdown {drawdown:.1%} >= {self.config.max_drawdown:.1%}"
            )

    def register_close(self, pnl: float, bar_index: int = 0) -> None:
        self.state.day_realised += pnl
        if pnl < 0:
            self.state.consecutive_losses += 1
            if self.state.consecutive_losses >= self.config.consecutive_loss_pause:
                self.state.pause_until_bar = bar_index + self.config.pause_bars
                self.state.consecutive_losses = 0
        else:
            self.state.consecutive_losses = 0

    def daily_pnl_pct(self) -> float:
        if self.state.day_start_balance <= 0:
            return 0.0
        return self.state.day_realised / self.state.day_start_balance

    # -- gates ------------------------------------------------------------
    def can_open(
        self,
        moment: datetime,
        account: AccountState,
        open_positions: list[Position],
        bar_index: int,
        spread: float,
    ) -> tuple[bool, str]:
        cfg = self.config
        if self.state.halted:
            return False, f"halted:{self.state.halt_reason}"

        tradable, why = self.sessions.can_trade(moment)
        if not tradable:
            return False, why
        if bar_index <= self.state.pause_until_bar:
            return False, "cooldown"
        if len(open_positions) >= cfg.max_open_positions:
            return False, "max_positions"
        if self.state.trades_today >= cfg.max_trades_per_day:
            return False, "max_trades_today"
        if spread > cfg.max_spread:
            return False, "spread_too_wide"

        daily = self.daily_pnl_pct()
        if daily <= -cfg.max_daily_loss:
            return False, "daily_loss_limit"
        if cfg.max_daily_profit_lock and daily >= cfg.max_daily_profit_lock:
            return False, "daily_profit_lock"
        return True, "ok"

    # -- sizing -----------------------------------------------------------
    def size_position(
        self, account: AccountState, stop_distance: float, confidence: float
    ) -> tuple[float, float]:
        """Return (lots, risk_amount). Fixed-fractional, confidence-scaled."""
        cfg = self.config
        if stop_distance <= 0:
            return 0.0, 0.0

        factor = 1.0
        if cfg.confidence_scaling:
            # Map confidence 0.3..0.8 onto the size factor band.
            span = max(1e-9, 0.8 - 0.3)
            scaled = (confidence - 0.3) / span
            factor = cfg.min_size_factor + (cfg.max_size_factor - cfg.min_size_factor) * max(
                0.0, min(1.0, scaled)
            )
        if cfg.streak_derisk and self.state.consecutive_losses >= 2:
            factor *= 0.6

        risk_amount = account.equity * cfg.risk_per_trade * factor
        risk_per_lot = stop_distance * CONTRACT_SIZE
        lots = risk_amount / risk_per_lot

        # The margin cap needs the actual price and is applied in
        # size_for_price(); here we only cap absolute size.
        lots = min(lots, cfg.max_lots)
        lots = round_lots(lots, cfg.lot_step, cfg.min_lots)
        return lots, lots * risk_per_lot

    def size_for_price(
        self, account: AccountState, stop_distance: float, confidence: float, price: float
    ) -> tuple[float, float]:
        """Sizing with the real price available, so the margin cap is exact."""
        cfg = self.config
        lots, risk_amount = self.size_position(account, stop_distance, confidence)
        if lots <= 0 or cfg.leverage <= 0:
            return lots, risk_amount
        margin_per_lot = price * CONTRACT_SIZE / cfg.leverage
        max_lots = (account.equity * cfg.max_margin_utilisation) / max(margin_per_lot, 1e-9)
        if lots > max_lots:
            lots = round_lots(max_lots, cfg.lot_step, cfg.min_lots)
            risk_amount = lots * stop_distance * CONTRACT_SIZE
        return lots, risk_amount

    # -- the plan ---------------------------------------------------------
    def build_plan(
        self,
        decision: EnsembleDecision,
        view: MarketView,
        account: AccountState,
        open_positions: list[Position],
        bar_index: int,
        spread: float,
        entry_price: Optional[float] = None,
    ) -> tuple[Optional[TradePlan], str]:
        cfg = self.config
        if not decision.actionable:
            return None, decision.rejected or "no_signal"

        allowed, why = self.can_open(view.time, account, open_positions, bar_index, spread)
        if not allowed:
            self.state.note(why)
            return None, why

        direction = decision.direction
        side = Side.BUY if direction is Direction.LONG else Side.SELL

        if open_positions and not cfg.allow_hedging:
            if any(p.side is not side for p in open_positions):
                self.state.note("opposite_exposure")
                return None, "opposite_exposure"
            if any(p.side is side for p in open_positions) and cfg.max_open_positions <= 1:
                self.state.note("already_in_position")
                return None, "already_in_position"

        # Enter at the far side of the spread — the price actually available.
        mid = view.close if entry_price is None else entry_price
        entry = mid + spread / 2.0 if side is Side.BUY else mid - spread / 2.0
        entry = round_price(entry)

        stop = stop_rules.initial_stop(view, direction, entry, self.stops, decision.stop_hint)
        distance = abs(entry - stop)
        if distance < max(cfg.min_stop_distance, spread * 2.0):
            self.state.note("stop_too_tight")
            return None, "stop_too_tight"

        target = stop_rules.take_profit(entry, stop, direction, self.stops, decision.target_hint)
        rr = abs(target - entry) / distance if distance else 0.0
        if rr < cfg.min_reward_risk:
            self.state.note("reward_risk_too_low")
            return None, f"reward_risk {rr:.2f} < {cfg.min_reward_risk}"

        lots, risk_amount = self.size_for_price(account, distance, decision.confidence, entry)
        if lots < cfg.min_lots:
            self.state.note("size_below_minimum")
            return None, "size_below_minimum"

        # Final sanity: the modelled loss must not exceed the configured budget.
        modelled_loss = lots * distance * CONTRACT_SIZE
        budget = account.equity * cfg.risk_per_trade * cfg.max_size_factor * 1.05
        if modelled_loss > budget:
            lots = round_lots(budget / (distance * CONTRACT_SIZE), cfg.lot_step, cfg.min_lots)
            if lots < cfg.min_lots:
                self.state.note("size_below_minimum")
                return None, "size_below_minimum"
            risk_amount = lots * distance * CONTRACT_SIZE

        partial = stop_rules.partial_level(entry, stop, direction, self.stops)
        plan = TradePlan(
            side=side,
            entry=entry,
            stop_loss=stop,
            take_profit=target,
            lots=lots,
            risk_amount=risk_amount,
            risk_per_lot=distance * CONTRACT_SIZE,
            confidence=decision.confidence,
            regime=decision.regime,
            contributors=dict(decision.contributors),
            comment=decision.describe(),
            partial_tp=partial,
            partial_fraction=self.stops.partial_fraction,
        )
        return plan, "ok"

    def on_trade_opened(self) -> None:
        self.state.trades_today += 1

    def summary(self) -> dict[str, object]:
        return {
            "halted": self.state.halted,
            "halt_reason": self.state.halt_reason,
            "trades_today": self.state.trades_today,
            "daily_pnl_pct": round(self.daily_pnl_pct() * 100, 3),
            "consecutive_losses": self.state.consecutive_losses,
            "peak_equity": round(self.state.peak_equity, 2),
            "rejections": dict(sorted(self.state.rejections.items(), key=lambda kv: -kv[1])),
        }
