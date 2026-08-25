"""Session and volatility breakout strategies.

Gold's day has a shape: a quiet Asian range, an expansion when London opens,
and a second impulse at the New York overlap. These strategies trade that
shape directly, which is where a large part of the intraday edge in XAUUSD
actually lives.
"""

from __future__ import annotations

from datetime import time

import numpy as np

from ..core.features import MarketView
from ..core.types import Direction, StrategySignal, as_utc
from ..risk.sessions import ASIAN_RANGE, LONDON, NEW_YORK
from .base import BREAKOUT_AFFINITY, Strategy


def _minutes_since(view: MarketView, session_start: time) -> float:
    now = as_utc(view.time)
    start_minutes = session_start.hour * 60 + session_start.minute
    now_minutes = now.hour * 60 + now.minute
    delta = now_minutes - start_minutes
    if delta < 0:
        delta += 24 * 60
    return float(delta)


def _range_of_window(view: MarketView, bars: int) -> tuple[float, float]:
    highs = view.window("high", bars)
    lows = view.window("low", bars)
    if len(highs) == 0:
        return float("nan"), float("nan")
    return float(np.max(highs)), float(np.min(lows))


class AsianRangeBreakout(Strategy):
    """Break of the Asian session box, taken on the London expansion.

    The box is measured over the completed Asian window; a break is only valid
    while London is young (the first three hours) and only if the box is
    genuinely compressed relative to recent ATR.
    """

    name = "asian_breakout"
    kind = "breakout"
    warmup = 120
    regime_affinity = BREAKOUT_AFFINITY

    def __init__(self, max_box_atr: float = 4.0, valid_minutes: int = 180, **kw):
        super().__init__(max_box_atr=max_box_atr, valid_minutes=valid_minutes, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        now = as_utc(view.time)
        atr = view.f("atr")
        if not np.isfinite(atr) or atr <= 0:
            return self.flat("warmup")
        if not LONDON.contains(now):
            return self.flat("not_london")
        since_open = _minutes_since(view, LONDON.start)
        if since_open > self.valid_minutes:
            return self.flat("london_too_old")

        # Walk back over the bars that fall inside the Asian window.
        highs: list[float] = []
        lows: list[float] = []
        for offset in range(1, 96):
            j = view.i - offset
            if j < 0:
                break
            stamp = as_utc(view.df.index[j].to_pydatetime())
            if ASIAN_RANGE.contains(stamp):
                highs.append(float(view.df["high"].iat[j]))
                lows.append(float(view.df["low"].iat[j]))
            elif highs:
                break
        if len(highs) < 4:
            return self.flat("no_asian_data")

        box_high, box_low = max(highs), min(lows)
        box_size = box_high - box_low
        if box_size <= 0 or box_size > self.max_box_atr * atr:
            return self.flat("box_too_wide")

        compression = 1.0 - min(1.0, box_size / (self.max_box_atr * atr))
        close, prev_close = view.close, view.bar("close", 1)
        buffer = 0.15 * atr

        if close > box_high + buffer and prev_close <= box_high + buffer:
            return self.signal(
                Direction.LONG,
                0.50 + 0.30 * compression,
                f"London break of Asian box high {box_high:.2f}",
                stop_hint=box_low if box_size < 2.5 * atr else close - 1.5 * atr,
                target_hint=close + max(box_size, 1.5 * atr),
                box_high=box_high,
                box_low=box_low,
            )
        if close < box_low - buffer and prev_close >= box_low - buffer:
            return self.signal(
                Direction.SHORT,
                0.50 + 0.30 * compression,
                f"London break of Asian box low {box_low:.2f}",
                stop_hint=box_high if box_size < 2.5 * atr else close + 1.5 * atr,
                target_hint=close - max(box_size, 1.5 * atr),
                box_high=box_high,
                box_low=box_low,
            )
        return self.flat("inside_box")


class OpeningRangeBreakout(Strategy):
    """New York opening range breakout.

    The first `or_minutes` of the New York session define the range; a break of
    it during the London/NY overlap is the highest-participation move of the
    gold day.
    """

    name = "ny_orb"
    kind = "breakout"
    warmup = 120
    regime_affinity = BREAKOUT_AFFINITY

    def __init__(self, or_minutes: int = 30, valid_minutes: int = 180, **kw):
        super().__init__(or_minutes=or_minutes, valid_minutes=valid_minutes, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        now = as_utc(view.time)
        atr = view.f("atr")
        if not np.isfinite(atr) or atr <= 0:
            return self.flat("warmup")
        if not NEW_YORK.contains(now):
            return self.flat("not_ny")

        since_open = _minutes_since(view, NEW_YORK.start)
        if since_open <= self.or_minutes:
            return self.flat("range_forming")
        if since_open > self.valid_minutes:
            return self.flat("window_closed")

        bar_minutes = self._bar_minutes(view)
        or_bars = max(1, int(round(self.or_minutes / bar_minutes)))
        elapsed_bars = max(1, int(round(since_open / bar_minutes)))
        skip = elapsed_bars - or_bars
        highs, lows = [], []
        for offset in range(skip, skip + or_bars):
            j = view.i - offset
            if j < 0:
                break
            highs.append(float(view.df["high"].iat[j]))
            lows.append(float(view.df["low"].iat[j]))
        if not highs:
            return self.flat("no_range")

        or_high, or_low = max(highs), min(lows)
        or_size = or_high - or_low
        if or_size <= 0:
            return self.flat("degenerate_range")

        quality = 1.0 - min(1.0, abs(or_size / atr - 1.5) / 2.0)
        close, prev_close = view.close, view.bar("close", 1)
        buffer = 0.1 * atr

        if close > or_high + buffer and prev_close <= or_high + buffer:
            return self.signal(
                Direction.LONG,
                0.48 + 0.30 * max(0.0, quality),
                f"NY ORB long above {or_high:.2f}",
                stop_hint=or_low if or_size < 2.0 * atr else close - 1.2 * atr,
                target_hint=close + 2.0 * or_size,
            )
        if close < or_low - buffer and prev_close >= or_low - buffer:
            return self.signal(
                Direction.SHORT,
                0.48 + 0.30 * max(0.0, quality),
                f"NY ORB short below {or_low:.2f}",
                stop_hint=or_high if or_size < 2.0 * atr else close + 1.2 * atr,
                target_hint=close - 2.0 * or_size,
            )
        return self.flat("inside_range")

    @staticmethod
    def _bar_minutes(view: MarketView) -> float:
        if view.i < 1:
            return 15.0
        delta = view.df.index[view.i] - view.df.index[view.i - 1]
        minutes = delta.total_seconds() / 60.0
        return minutes if minutes > 0 else 15.0


class SqueezeRelease(Strategy):
    """TTM-style squeeze: Bollinger inside Keltner, then the expansion bar.

    Volatility is mean-reverting even when price is not, so a long compression
    is the single most reliable precursor to a directional move in gold.
    """

    name = "squeeze"
    kind = "breakout"
    warmup = 220
    regime_affinity = BREAKOUT_AFFINITY

    def __init__(self, min_squeeze_bars: int = 6, **kw):
        super().__init__(min_squeeze_bars=min_squeeze_bars, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        atr = view.f("atr")
        if not np.isfinite(atr) or atr <= 0:
            return self.flat("warmup")
        if view.b("squeeze"):
            return self.flat("still_squeezed")

        squeeze_bars = 0
        for offset in range(1, 60):
            if view.b("squeeze", offset):
                squeeze_bars += 1
            else:
                break
        if squeeze_bars < self.min_squeeze_bars:
            return self.flat("no_prior_squeeze")

        body = view.close - view.open
        expansion = abs(body) / atr
        if expansion < 0.5:
            return self.flat("weak_release")

        maturity = min(1.0, squeeze_bars / 20.0)
        confidence = 0.45 + 0.25 * maturity + 0.20 * min(1.0, expansion / 1.5)
        momentum_ok = view.f("macd_hist")

        if body > 0 and (not np.isfinite(momentum_ok) or momentum_ok > 0):
            return self.signal(
                Direction.LONG,
                confidence,
                f"squeeze release up after {squeeze_bars} bars",
                stop_hint=min(view.low, view.f("kc_mid")) - 0.5 * atr,
            )
        if body < 0 and (not np.isfinite(momentum_ok) or momentum_ok < 0):
            return self.signal(
                Direction.SHORT,
                confidence,
                f"squeeze release down after {squeeze_bars} bars",
                stop_hint=max(view.high, view.f("kc_mid")) + 0.5 * atr,
            )
        return self.flat("direction_unclear")


class PriorDayBreak(Strategy):
    """Break and hold of the previous day's high/low.

    The prior day's extremes are where resting stops sit. This takes the
    *continuation* case — a decisive close beyond the level with volatility
    expanding — and leaves the failure case to the liquidity-sweep strategy.
    """

    name = "prior_day_break"
    kind = "breakout"
    warmup = 220
    regime_affinity = BREAKOUT_AFFINITY

    def generate(self, view: MarketView) -> StrategySignal:
        pd_high, pd_low, atr = view.f("pd_high"), view.f("pd_low"), view.f("atr")
        if not all(np.isfinite(x) for x in (pd_high, pd_low, atr)) or atr <= 0:
            return self.flat("warmup")

        close, prev_close = view.close, view.bar("close", 1)
        bias = view.f("trend_bias")
        buffer = 0.2 * atr

        if close > pd_high + buffer and prev_close <= pd_high + buffer and bias > 0:
            return self.signal(
                Direction.LONG,
                0.48 + 0.25 * min(1.0, bias),
                f"break of prior-day high {pd_high:.2f}",
                stop_hint=pd_high - 0.5 * atr,
                target_hint=close + 2.0 * atr,
            )
        if close < pd_low - buffer and prev_close >= pd_low - buffer and bias < 0:
            return self.signal(
                Direction.SHORT,
                0.48 + 0.25 * min(1.0, abs(bias)),
                f"break of prior-day low {pd_low:.2f}",
                stop_hint=pd_low + 0.5 * atr,
                target_hint=close - 2.0 * atr,
            )
        return self.flat("no_break")
