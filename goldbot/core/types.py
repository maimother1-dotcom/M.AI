"""Core value types shared by data, strategy, risk and execution layers.

Everything here is deliberately plain: dataclasses and enums, no pandas, no
broker imports. Both the backtester and the live engine speak this vocabulary,
which is what lets a strategy run unmodified in either.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

# XAUUSD contract facts. One standard lot is 100 troy ounces, so a $1.00 move
# in the gold price is worth $100 per lot. Every sizing calculation in the bot
# funnels through CONTRACT_SIZE rather than hardcoding 100 in a dozen places.
CONTRACT_SIZE = 100.0
PRICE_DECIMALS = 2


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

    @property
    def sign(self) -> int:
        return 1 if self is Side.BUY else -1

    @property
    def opposite(self) -> "Side":
        return Side.SELL if self is Side.BUY else Side.BUY


class Direction(int, Enum):
    """Strategy opinion. FLAT means "no opinion", not "close everything"."""

    LONG = 1
    FLAT = 0
    SHORT = -1

    @property
    def side(self) -> Optional[Side]:
        if self is Direction.LONG:
            return Side.BUY
        if self is Direction.SHORT:
            return Side.SELL
        return None


class Regime(str, Enum):
    """Coarse market state. Strategy weights are gated on this."""

    STRONG_TREND = "strong_trend"
    WEAK_TREND = "weak_trend"
    RANGE = "range"
    VOLATILE_CHOP = "volatile_chop"


class ExitReason(str, Enum):
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    TRAILING_STOP = "trailing_stop"
    PARTIAL_TP = "partial_tp"
    TIME_STOP = "time_stop"
    SIGNAL_FLIP = "signal_flip"
    SESSION_END = "session_end"
    DAILY_LOSS_LIMIT = "daily_loss_limit"
    KILL_SWITCH = "kill_switch"
    MANUAL = "manual"


@dataclass(frozen=True)
class Candle:
    """One closed bar. Times are always timezone-aware UTC."""

    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    @property
    def range(self) -> float:
        return self.high - self.low

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def bullish(self) -> bool:
        return self.close >= self.open


@dataclass(frozen=True)
class Tick:
    """Current market quote. `spread` is derived, never stored separately."""

    time: datetime
    bid: float
    ask: float

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2.0

    @property
    def spread(self) -> float:
        return self.ask - self.bid


@dataclass
class StrategySignal:
    """A single strategy's vote on the current bar.

    `confidence` is 0..1 and is the strategy's own conviction *before* the
    ensemble applies its weight. `stop_hint` lets a strategy express where its
    idea is invalidated (a swing low, the other side of a range); the risk
    layer takes the wider of that and the ATR floor.
    """

    name: str
    direction: Direction
    confidence: float = 0.0
    stop_hint: Optional[float] = None
    target_hint: Optional[float] = None
    reason: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.confidence = float(min(1.0, max(0.0, self.confidence)))
        if self.direction is Direction.FLAT:
            self.confidence = 0.0

    @property
    def score(self) -> float:
        return self.direction.value * self.confidence


@dataclass
class TradePlan:
    """A fully specified trade, ready for the broker.

    Produced by the risk manager from an ensemble decision. If the risk manager
    refuses the trade it returns None instead of a plan with zero size, so a
    TradePlan in hand always means "this is executable".
    """

    side: Side
    entry: float
    stop_loss: float
    take_profit: Optional[float]
    lots: float
    risk_amount: float
    risk_per_lot: float
    confidence: float
    regime: Regime
    contributors: dict[str, float] = field(default_factory=dict)
    comment: str = ""
    partial_tp: Optional[float] = None
    partial_fraction: float = 0.0

    @property
    def stop_distance(self) -> float:
        return abs(self.entry - self.stop_loss)

    @property
    def reward_risk(self) -> Optional[float]:
        if self.take_profit is None or self.stop_distance <= 0:
            return None
        return abs(self.take_profit - self.entry) / self.stop_distance


@dataclass
class Position:
    """An open position as the bot understands it.

    `lots` shrinks when a partial take-profit fires; `initial_lots` is kept so
    R-multiples are reported against the size the trade was opened with.
    """

    ticket: int
    side: Side
    entry_price: float
    lots: float
    stop_loss: float
    take_profit: Optional[float]
    opened_at: datetime
    initial_lots: float = 0.0
    initial_stop: float = 0.0
    partial_done: bool = False
    breakeven_done: bool = False
    bars_held: int = 0
    max_favourable: float = 0.0
    max_adverse: float = 0.0
    realized_pnl: float = 0.0
    comment: str = ""
    contributors: dict[str, float] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.initial_lots:
            self.initial_lots = self.lots
        if not self.initial_stop:
            self.initial_stop = self.stop_loss

    @property
    def initial_risk_per_unit(self) -> float:
        return abs(self.entry_price - self.initial_stop)

    def unrealized(self, price: float) -> float:
        return (price - self.entry_price) * self.side.sign * self.lots * CONTRACT_SIZE

    def r_multiple(self, price: float) -> float:
        risk = self.initial_risk_per_unit
        if risk <= 0:
            return 0.0
        return (price - self.entry_price) * self.side.sign / risk

    def update_excursions(self, high: float, low: float) -> None:
        best = high if self.side is Side.BUY else low
        worst = low if self.side is Side.BUY else high
        self.max_favourable = max(
            self.max_favourable, (best - self.entry_price) * self.side.sign
        )
        self.max_adverse = min(
            self.max_adverse, (worst - self.entry_price) * self.side.sign
        )


@dataclass
class Trade:
    """A closed trade, as written to the journal and fed to the metrics."""

    ticket: int
    side: Side
    lots: float
    entry_price: float
    exit_price: float
    opened_at: datetime
    closed_at: datetime
    pnl: float
    r_multiple: float
    exit_reason: ExitReason
    initial_stop: float
    bars_held: int = 0
    commission: float = 0.0
    max_favourable: float = 0.0
    max_adverse: float = 0.0
    regime: str = ""
    confidence: float = 0.0
    contributors: dict[str, float] = field(default_factory=dict)
    comment: str = ""

    @property
    def won(self) -> bool:
        return self.pnl > 0

    @property
    def duration_hours(self) -> float:
        return (self.closed_at - self.opened_at).total_seconds() / 3600.0

    def to_row(self) -> dict[str, Any]:
        return {
            "ticket": self.ticket,
            "side": self.side.value,
            "lots": round(self.lots, 2),
            "entry": round(self.entry_price, PRICE_DECIMALS),
            "exit": round(self.exit_price, PRICE_DECIMALS),
            "opened_at": self.opened_at.isoformat(),
            "closed_at": self.closed_at.isoformat(),
            "pnl": round(self.pnl, 2),
            "r": round(self.r_multiple, 3),
            "exit_reason": self.exit_reason.value,
            "bars_held": self.bars_held,
            "commission": round(self.commission, 2),
            "mfe": round(self.max_favourable, 2),
            "mae": round(self.max_adverse, 2),
            "regime": self.regime,
            "confidence": round(self.confidence, 3),
            "contributors": self.contributors,
            "comment": self.comment,
        }


@dataclass
class AccountState:
    balance: float
    equity: float
    open_positions: int = 0
    margin_used: float = 0.0

    @property
    def free_equity(self) -> float:
        return self.equity - self.margin_used


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Attach UTC to a naive datetime, convert an aware one."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def round_price(price: float) -> float:
    return round(float(price), PRICE_DECIMALS)


def round_lots(lots: float, step: float = 0.01, minimum: float = 0.01) -> float:
    """Floor to the broker's lot step. Flooring, not rounding, so a rounding
    artefact can never push size above the risk budget."""
    if lots <= 0 or step <= 0:
        return 0.0
    steps = math.floor(lots / step + 1e-9)
    value = round(steps * step, 8)
    return value if value >= minimum - 1e-9 else 0.0
