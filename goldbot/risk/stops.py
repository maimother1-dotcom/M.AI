"""Stop placement and trade management.

The exit is where the edge is realised or given back, so this module owns the
whole lifecycle: where the stop starts, when it moves to break-even, when half
the position comes off, and how the rest is trailed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from ..core.features import MarketView
from ..core.types import Direction, ExitReason, Position, Side, round_price


@dataclass
class StopConfig:
    #: Initial stop distance as a multiple of ATR.
    atr_mult: float = 1.8
    #: Never place a stop tighter than this many ATR (spread + noise floor).
    min_atr_mult: float = 1.0
    #: Or wider than this — a wide stop means a small position, not a big loss.
    max_atr_mult: float = 3.5
    #: Extra padding beyond a structural level, in ATR.
    structure_pad: float = 0.25
    #: Reward:risk for the full target.
    take_profit_r: float = 2.6
    #: Take part of the position off at this R.
    partial_at_r: float = 1.0
    partial_fraction: float = 0.5
    #: Move the stop to entry once this R is reached.
    breakeven_at_r: float = 1.0
    breakeven_offset_r: float = 0.08
    #: Chandelier trail: start trailing past this R, at this ATR distance.
    trail_start_r: float = 1.4
    trail_atr_mult: float = 2.2
    #: Give up on a trade that has gone nowhere.
    time_stop_bars: int = 48
    time_stop_min_r: float = 0.35
    #: Exit if the ensemble flips hard against an open position.
    exit_on_flip: bool = True
    flip_confidence: float = 0.45


def initial_stop(
    view: MarketView,
    direction: Direction,
    entry: float,
    cfg: StopConfig,
    structure_hint: Optional[float] = None,
) -> float:
    """Blend the ATR floor with the structural invalidation level.

    The stop goes behind structure when structure is close enough to be
    affordable, and falls back to a pure ATR stop when it is not.
    """
    atr = view.f("atr")
    if not np.isfinite(atr) or atr <= 0:
        atr = max(0.001 * entry, 0.5)

    base = cfg.atr_mult * atr
    candidate = entry - base if direction is Direction.LONG else entry + base

    if structure_hint is not None and np.isfinite(structure_hint):
        pad = cfg.structure_pad * atr
        structural = (
            structure_hint - pad if direction is Direction.LONG else structure_hint + pad
        )
        # Take the wider of the two, then clamp to the max.
        if direction is Direction.LONG:
            candidate = min(candidate, structural)
        else:
            candidate = max(candidate, structural)

    distance = abs(entry - candidate)
    distance = max(cfg.min_atr_mult * atr, min(cfg.max_atr_mult * atr, distance))
    stop = entry - distance if direction is Direction.LONG else entry + distance
    return round_price(stop)


def take_profit(
    entry: float,
    stop: float,
    direction: Direction,
    cfg: StopConfig,
    target_hint: Optional[float] = None,
) -> float:
    risk = abs(entry - stop)
    target = (
        entry + cfg.take_profit_r * risk
        if direction is Direction.LONG
        else entry - cfg.take_profit_r * risk
    )
    if target_hint is not None and np.isfinite(target_hint):
        # Respect a strategy's objective only if it still clears 1.2R; a nearer
        # one is not worth the risk being taken.
        hint_r = abs(target_hint - entry) / risk if risk > 0 else 0.0
        beyond = (
            target_hint > entry if direction is Direction.LONG else target_hint < entry
        )
        if beyond and hint_r >= 1.2:
            target = (
                min(target, target_hint)
                if direction is Direction.LONG
                else max(target, target_hint)
            )
    return round_price(target)


def partial_level(entry: float, stop: float, direction: Direction, cfg: StopConfig) -> Optional[float]:
    if cfg.partial_fraction <= 0 or cfg.partial_at_r <= 0:
        return None
    risk = abs(entry - stop)
    level = (
        entry + cfg.partial_at_r * risk
        if direction is Direction.LONG
        else entry - cfg.partial_at_r * risk
    )
    return round_price(level)


def chandelier_stop(
    position: Position, view: MarketView, cfg: StopConfig, bars: int = 22
) -> Optional[float]:
    """Trail from the extreme reached since entry, not from the current close —
    that is what keeps the stop from ratcheting on a single spike."""
    atr = view.f("atr")
    if not np.isfinite(atr) or atr <= 0:
        return None
    if position.side is Side.BUY:
        highest = float(np.max(view.window("high", bars)))
        return round_price(highest - cfg.trail_atr_mult * atr)
    lowest = float(np.min(view.window("low", bars)))
    return round_price(lowest + cfg.trail_atr_mult * atr)


def manage_position(
    position: Position,
    view: MarketView,
    cfg: StopConfig,
    price: float,
) -> tuple[Optional[float], list[tuple[ExitReason, float]]]:
    """Return (new_stop_or_None, actions) for an open position.

    `actions` carries partial closes and time stops as
    (reason, fraction_of_current_size). The caller (backtester or live engine)
    is responsible for executing them, so this stays pure and testable.
    """
    actions: list[tuple[ExitReason, float]] = []
    r = position.r_multiple(price)
    risk = position.initial_risk_per_unit
    new_stop: Optional[float] = None

    if risk <= 0:
        return None, actions

    # 1. Scale out once the trade has paid for itself.
    if (
        not position.partial_done
        and cfg.partial_fraction > 0
        and r >= cfg.partial_at_r
    ):
        actions.append((ExitReason.PARTIAL_TP, cfg.partial_fraction))

    # 2. Break-even (plus a small offset to cover spread and commission).
    if not position.breakeven_done and r >= cfg.breakeven_at_r:
        offset = cfg.breakeven_offset_r * risk
        be = (
            position.entry_price + offset
            if position.side is Side.BUY
            else position.entry_price - offset
        )
        new_stop = be

    # 3. Chandelier trail on the remainder.
    if r >= cfg.trail_start_r:
        trail = chandelier_stop(position, view, cfg)
        if trail is not None:
            new_stop = _tighter(position.side, new_stop, trail)

    # Never loosen a stop.
    if new_stop is not None:
        current = position.stop_loss
        if position.side is Side.BUY and new_stop <= current:
            new_stop = None
        elif position.side is Side.SELL and new_stop >= current:
            new_stop = None

    # 4. Time stop: capital tied up in a trade going nowhere is capital at risk
    #    for no expected return.
    if (
        cfg.time_stop_bars
        and position.bars_held >= cfg.time_stop_bars
        and r < cfg.time_stop_min_r
    ):
        actions.append((ExitReason.TIME_STOP, 1.0))

    return (round_price(new_stop) if new_stop is not None else None), actions


def _tighter(side: Side, a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b) if side is Side.BUY else min(a, b)
