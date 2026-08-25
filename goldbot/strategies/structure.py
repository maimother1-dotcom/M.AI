"""Price-structure strategies (liquidity, imbalance, retracement).

These encode what the "smart money" school describes in words — stop hunts,
fair-value gaps, discount entries in a trend — as mechanical, testable rules.
Stripped of the mystique, each is a specific, falsifiable pattern.
"""

from __future__ import annotations

import numpy as np

from ..core.features import MarketView
from ..core.types import Direction, StrategySignal
from .base import STRUCTURE_AFFINITY, Strategy


class LiquiditySweep(Strategy):
    """Stop-run reversal: sweep a prior extreme, then reject and close back inside.

    A sweep only counts when the bar's wick takes out a recent swing level and
    the close returns inside it. That failure-to-hold is the tell that the move
    was liquidity collection rather than a genuine break.
    """

    name = "liquidity_sweep"
    kind = "structure"
    warmup = 120
    regime_affinity = STRUCTURE_AFFINITY

    def __init__(self, lookback: int = 20, min_wick_ratio: float = 0.5, **kw):
        super().__init__(lookback=lookback, min_wick_ratio=min_wick_ratio, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        atr = view.f("atr")
        if not np.isfinite(atr) or atr <= 0:
            return self.flat("warmup")

        prior_high = float(np.max(view.window("high", self.lookback + 1)[:-1]))
        prior_low = float(np.min(view.window("low", self.lookback + 1)[:-1]))
        high, low, close, open_ = view.high, view.low, view.close, view.open
        bar_range = max(high - low, 1e-9)

        upper_wick = (high - max(close, open_)) / bar_range
        lower_wick = (min(close, open_) - low) / bar_range

        swept_high = high > prior_high and close < prior_high
        swept_low = low < prior_low and close > prior_low

        if swept_high and upper_wick >= self.min_wick_ratio:
            depth = min(1.0, (high - prior_high) / atr)
            return self.signal(
                Direction.SHORT,
                0.50 + 0.25 * upper_wick + 0.15 * depth,
                f"swept {self.lookback}-bar high {prior_high:.2f} and rejected",
                stop_hint=high + 0.35 * atr,
                target_hint=close - 2.0 * atr,
                swept_level=prior_high,
            )
        if swept_low and lower_wick >= self.min_wick_ratio:
            depth = min(1.0, (prior_low - low) / atr)
            return self.signal(
                Direction.LONG,
                0.50 + 0.25 * lower_wick + 0.15 * depth,
                f"swept {self.lookback}-bar low {prior_low:.2f} and rejected",
                stop_hint=low - 0.35 * atr,
                target_hint=close + 2.0 * atr,
                swept_level=prior_low,
            )
        return self.flat("no_sweep")


class FairValueGap(Strategy):
    """Trade the retest of a three-bar imbalance in the trend direction.

    A fair-value gap is a bar whose range does not overlap the bar two back —
    price moved so fast it left an unfilled zone. Gold fills those gaps often
    enough that the first retest is a high-quality continuation entry.
    """

    name = "fvg_retest"
    kind = "structure"
    warmup = 120
    regime_affinity = STRUCTURE_AFFINITY

    def __init__(self, max_age: int = 12, min_gap_atr: float = 0.35, **kw):
        super().__init__(max_age=max_age, min_gap_atr=min_gap_atr, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        atr, bias = view.f("atr"), view.f("trend_bias")
        if not np.isfinite(atr) or atr <= 0 or not np.isfinite(bias):
            return self.flat("warmup")

        low, high, close = view.low, view.high, view.close

        for age in range(2, self.max_age + 1):
            # Gap defined by bars (age+1, age-1) around the impulse bar `age`.
            older_high = view.bar("high", age + 1)
            older_low = view.bar("low", age + 1)
            newer_high = view.bar("high", age - 1)
            newer_low = view.bar("low", age - 1)
            if not all(np.isfinite(x) for x in (older_high, older_low, newer_high, newer_low)):
                continue

            bull_gap = newer_low - older_high
            bear_gap = older_low - newer_high

            if bull_gap >= self.min_gap_atr * atr and bias > 0.1:
                zone_top, zone_bottom = newer_low, older_high
                touched = low <= zone_top and close >= zone_bottom
                if touched and self._untouched_before(view, age, zone_top, zone_bottom):
                    quality = min(1.0, bull_gap / (1.5 * atr))
                    return self.signal(
                        Direction.LONG,
                        0.45 + 0.25 * quality + 0.15 * min(1.0, bias),
                        f"retest of bullish FVG {zone_bottom:.2f}-{zone_top:.2f}",
                        stop_hint=zone_bottom - 0.5 * atr,
                        target_hint=close + 2.5 * atr,
                    )
            if bear_gap >= self.min_gap_atr * atr and bias < -0.1:
                zone_top, zone_bottom = older_low, newer_high
                touched = high >= zone_bottom and close <= zone_top
                if touched and self._untouched_before(view, age, zone_top, zone_bottom):
                    quality = min(1.0, bear_gap / (1.5 * atr))
                    return self.signal(
                        Direction.SHORT,
                        0.45 + 0.25 * quality + 0.15 * min(1.0, abs(bias)),
                        f"retest of bearish FVG {zone_bottom:.2f}-{zone_top:.2f}",
                        stop_hint=zone_top + 0.5 * atr,
                        target_hint=close - 2.5 * atr,
                    )
        return self.flat("no_fvg_retest")

    @staticmethod
    def _untouched_before(
        view: MarketView, age: int, zone_top: float, zone_bottom: float
    ) -> bool:
        """First retest only — a zone that has already been traded through is spent."""
        for offset in range(1, age - 1):
            bar_low, bar_high = view.bar("low", offset), view.bar("high", offset)
            if bar_low <= zone_top and bar_high >= zone_bottom:
                return False
        return True


class FibonacciPullback(Strategy):
    """Golden-pocket continuation: 61.8% retracement of the last impulse leg,
    entered only on a confirmation bar in the trend direction."""

    name = "fib_pullback"
    kind = "structure"
    warmup = 160
    regime_affinity = STRUCTURE_AFFINITY

    def __init__(self, leg_lookback: int = 40, tolerance: float = 0.06, **kw):
        super().__init__(leg_lookback=leg_lookback, tolerance=tolerance, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        atr, bias = view.f("atr"), view.f("trend_bias")
        if not np.isfinite(atr) or atr <= 0 or not np.isfinite(bias):
            return self.flat("warmup")
        if abs(bias) < 0.2:
            return self.flat("no_trend")

        highs = view.window("high", self.leg_lookback)
        lows = view.window("low", self.leg_lookback)
        if len(highs) < self.leg_lookback:
            return self.flat("warmup")

        swing_high, swing_low = float(np.max(highs)), float(np.min(lows))
        leg = swing_high - swing_low
        if leg < 1.5 * atr:
            return self.flat("leg_too_small")

        high_idx, low_idx = int(np.argmax(highs)), int(np.argmin(lows))
        close, prev_close = view.close, view.bar("close", 1)
        retrace = (swing_high - close) / leg if leg else 0.0

        # Impulse up (low printed before high) → buy the discount.
        if bias > 0 and low_idx < high_idx:
            if abs(retrace - 0.618) <= self.tolerance and close > prev_close:
                return self.signal(
                    Direction.LONG,
                    0.45 + 0.25 * min(1.0, bias) + 0.15 * (1 - abs(retrace - 0.618) / self.tolerance),
                    f"golden pocket long, {retrace:.0%} retrace of {leg:.1f} leg",
                    stop_hint=swing_low + 0.2 * leg - 0.5 * atr,
                    target_hint=swing_high,
                )
        # Impulse down (high printed before low) → sell the premium.
        if bias < 0 and high_idx < low_idx:
            retrace_down = (close - swing_low) / leg if leg else 0.0
            if abs(retrace_down - 0.618) <= self.tolerance and close < prev_close:
                return self.signal(
                    Direction.SHORT,
                    0.45 + 0.25 * min(1.0, abs(bias)) + 0.15 * (1 - abs(retrace_down - 0.618) / self.tolerance),
                    f"golden pocket short, {retrace_down:.0%} retrace of {leg:.1f} leg",
                    stop_hint=swing_high - 0.2 * leg + 0.5 * atr,
                    target_hint=swing_low,
                )
        return self.flat("not_at_pocket")


class EngulfingAtLevel(Strategy):
    """Classic engulfing reversal, but only where it means something: at the
    prior-day extreme, the pivot, or a confirmed swing level."""

    name = "engulfing_level"
    kind = "structure"
    warmup = 220
    regime_affinity = STRUCTURE_AFFINITY

    def generate(self, view: MarketView) -> StrategySignal:
        atr = view.f("atr")
        if not np.isfinite(atr) or atr <= 0:
            return self.flat("warmup")

        open_, close = view.open, view.close
        prev_open, prev_close = view.bar("open", 1), view.bar("close", 1)
        body, prev_body = abs(close - open_), abs(prev_close - prev_open)
        if body < prev_body or body < 0.4 * atr:
            return self.flat("not_engulfing")

        levels = [
            view.f("pd_high"),
            view.f("pd_low"),
            view.f("pivot"),
            view.f("swing_high"),
            view.f("swing_low"),
        ]
        levels = [x for x in levels if np.isfinite(x)]
        if not levels:
            return self.flat("no_levels")

        tolerance = 0.5 * atr
        near = min(levels, key=lambda lv: min(abs(view.low - lv), abs(view.high - lv)))
        touched = view.low - tolerance <= near <= view.high + tolerance
        if not touched:
            return self.flat("not_at_level")

        bullish = close > open_ and close > prev_open and open_ <= prev_close
        bearish = close < open_ and close < prev_open and open_ >= prev_close
        strength = min(1.0, body / (1.2 * atr))

        if bullish:
            return self.signal(
                Direction.LONG,
                0.42 + 0.30 * strength,
                f"bullish engulfing at {near:.2f}",
                stop_hint=view.low - 0.4 * atr,
            )
        if bearish:
            return self.signal(
                Direction.SHORT,
                0.42 + 0.30 * strength,
                f"bearish engulfing at {near:.2f}",
                stop_hint=view.high + 0.4 * atr,
            )
        return self.flat("no_pattern")
