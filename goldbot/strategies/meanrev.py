"""Mean-reversion strategies.

Between the trends, gold oscillates around well-watched reference prices:
session VWAP, the prior day's pivot, the middle of the Bollinger band. These
strategies harvest that, and every one of them refuses to fight a confirmed
trend — fading a strong trend is the fastest way to lose an account.
"""

from __future__ import annotations

import numpy as np

from ..core.features import MarketView
from ..core.types import Direction, Regime, StrategySignal
from .base import MEANREV_AFFINITY, Strategy


class ConnorsRsi2(Strategy):
    """Larry Connors' RSI(2): buy deep short-term weakness inside an uptrend.

    The original rule is above/below the 200-period average; on gold the
    200-EMA plus a "not already collapsing" volatility check keeps it out of
    the falling-knife trades that break the pure version.
    """

    name = "connors_rsi2"
    kind = "mean_reversion"
    warmup = 220
    regime_affinity = MEANREV_AFFINITY

    def __init__(self, oversold: float = 8.0, overbought: float = 92.0, **kw):
        super().__init__(oversold=oversold, overbought=overbought, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        r2, slow, atr = view.f("rsi2"), view.f("ema_slow"), view.f("atr")
        close = view.close
        if not all(np.isfinite(x) for x in (r2, slow, atr)) or atr <= 0:
            return self.flat("warmup")
        if view.regime is Regime.VOLATILE_CHOP:
            return self.flat("chop")

        stretch = abs(close - slow) / atr
        if stretch > 8.0:
            return self.flat("too_far_from_anchor")

        if close > slow and r2 <= self.oversold:
            depth = (self.oversold - r2) / max(self.oversold, 1.0)
            return self.signal(
                Direction.LONG,
                0.50 + 0.30 * depth,
                f"RSI(2) {r2:.0f} oversold above 200EMA",
                stop_hint=close - 1.8 * atr,
                target_hint=view.f("ema_fast"),
            )
        if close < slow and r2 >= self.overbought:
            depth = (r2 - self.overbought) / max(100.0 - self.overbought, 1.0)
            return self.signal(
                Direction.SHORT,
                0.50 + 0.30 * depth,
                f"RSI(2) {r2:.0f} overbought below 200EMA",
                stop_hint=close + 1.8 * atr,
                target_hint=view.f("ema_fast"),
            )
        return self.flat("no_extreme")


class BollingerFade(Strategy):
    """Fade a band tag that fails to follow through.

    Requires a *rejection*: price traded outside the band during the bar but
    closed back inside. A close outside the band is a breakout, not a fade,
    and this strategy deliberately stays out of those.
    """

    name = "bollinger_fade"
    kind = "mean_reversion"
    warmup = 220
    regime_affinity = MEANREV_AFFINITY

    def __init__(self, adx_max: float = 25.0, **kw):
        super().__init__(adx_max=adx_max, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        upper, lower, mid = view.f("bb_upper"), view.f("bb_lower"), view.f("bb_mid")
        atr, adx, rsi_v = view.f("atr"), view.f("adx"), view.f("rsi")
        if not all(np.isfinite(x) for x in (upper, lower, mid, atr, adx, rsi_v)):
            return self.flat("warmup")
        if adx > self.adx_max:
            return self.flat("trending")

        high, low, close = view.high, view.low, view.close
        width = (upper - lower) / max(atr, 1e-9)
        if width < 1.5:
            return self.flat("bands_too_tight")

        if high > upper and close < upper and rsi_v > 60.0:
            rejection = (high - close) / max(high - low, 1e-9)
            return self.signal(
                Direction.SHORT,
                0.45 + 0.30 * rejection + 0.10 * min(1.0, (rsi_v - 60.0) / 20.0),
                "upper band rejection",
                stop_hint=high + 0.5 * atr,
                target_hint=mid,
            )
        if low < lower and close > lower and rsi_v < 40.0:
            rejection = (close - low) / max(high - low, 1e-9)
            return self.signal(
                Direction.LONG,
                0.45 + 0.30 * rejection + 0.10 * min(1.0, (40.0 - rsi_v) / 20.0),
                "lower band rejection",
                stop_hint=low - 0.5 * atr,
                target_hint=mid,
            )
        return self.flat("no_rejection")


class VwapReversion(Strategy):
    """Session VWAP snap-back.

    Institutions benchmark fills to VWAP, so stretched moves away from it tend
    to get pulled back inside the same session. Only taken when price is more
    than `min_atr` from VWAP and momentum has already stalled.
    """

    name = "vwap_reversion"
    kind = "mean_reversion"
    warmup = 120
    regime_affinity = MEANREV_AFFINITY

    def __init__(self, min_atr: float = 1.8, max_atr: float = 5.0, **kw):
        super().__init__(min_atr=min_atr, max_atr=max_atr, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        dist = view.f("vwap_dist_atr")
        vwap, atr, rsi_v = view.f("vwap"), view.f("atr"), view.f("rsi")
        if not all(np.isfinite(x) for x in (dist, vwap, atr, rsi_v)) or atr <= 0:
            return self.flat("warmup")
        if view.regime is Regime.STRONG_TREND:
            return self.flat("strong_trend")

        stalled_up = view.close < view.bar("close", 1) and view.high >= view.bar("high", 1)
        stalled_down = view.close > view.bar("close", 1) and view.low <= view.bar("low", 1)
        strength = min(1.0, (abs(dist) - self.min_atr) / max(self.max_atr - self.min_atr, 1e-9))

        if self.min_atr <= dist <= self.max_atr and stalled_up and rsi_v > 55.0:
            return self.signal(
                Direction.SHORT,
                0.42 + 0.33 * strength,
                f"{dist:.1f} ATR above VWAP, momentum stalled",
                stop_hint=view.high + 0.75 * atr,
                target_hint=vwap,
            )
        if -self.max_atr <= dist <= -self.min_atr and stalled_down and rsi_v < 45.0:
            return self.signal(
                Direction.LONG,
                0.42 + 0.33 * strength,
                f"{abs(dist):.1f} ATR below VWAP, momentum stalled",
                stop_hint=view.low - 0.75 * atr,
                target_hint=vwap,
            )
        return self.flat("not_stretched")


class PivotFade(Strategy):
    """Floor-trader pivots: fade the first touch of R1/S1 in a balanced market.

    The pivot set is computed from the previous *UTC* day, which is what the
    bank desks quoting gold levels use.
    """

    name = "pivot_fade"
    kind = "mean_reversion"
    warmup = 220
    regime_affinity = MEANREV_AFFINITY

    def generate(self, view: MarketView) -> StrategySignal:
        r1, s1, pivot = view.f("pivot_r1"), view.f("pivot_s1"), view.f("pivot")
        atr, adx = view.f("atr"), view.f("adx")
        if not all(np.isfinite(x) for x in (r1, s1, pivot, atr, adx)) or atr <= 0:
            return self.flat("warmup")
        if adx > 28.0:
            return self.flat("trending")

        high, low, close = view.high, view.low, view.close
        tolerance = 0.35 * atr

        touched_r1 = high >= r1 - tolerance and close < r1
        touched_s1 = low <= s1 + tolerance and close > s1
        # First touch only: skip if the level was already tested earlier today.
        prior_r1 = any(view.bar("high", k) >= r1 for k in range(1, 8))
        prior_s1 = any(view.bar("low", k) <= s1 for k in range(1, 8))

        if touched_r1 and not prior_r1:
            return self.signal(
                Direction.SHORT,
                0.45,
                f"first tag of R1 {r1:.2f}",
                stop_hint=max(high, r1) + 0.6 * atr,
                target_hint=pivot,
            )
        if touched_s1 and not prior_s1:
            return self.signal(
                Direction.LONG,
                0.45,
                f"first tag of S1 {s1:.2f}",
                stop_hint=min(low, s1) - 0.6 * atr,
                target_hint=pivot,
            )
        return self.flat("no_touch")
