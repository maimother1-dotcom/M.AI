"""Trend-following strategies.

Gold spends long stretches in directional moves driven by real-yield and
dollar repricing, then hands most of it back in violent two-way chop. Every
strategy here therefore insists on *confirmation* (ADX, efficiency ratio, or a
higher-timeframe agreement) rather than buying the first cross.
"""

from __future__ import annotations

import numpy as np

from ..core.features import MarketView
from ..core.types import Direction, StrategySignal
from .base import BREAKOUT_AFFINITY, TREND_AFFINITY, Strategy


class EmaStackTrend(Strategy):
    """Guppy-style EMA ribbon with an ADX gate and a pullback entry.

    Trades in the direction of a stacked 21/50/200 ribbon, but only after price
    pulls back toward the fast EMA — chasing an extended bar is how trend
    systems donate their edge to the market.
    """

    name = "ema_stack"
    kind = "trend"
    warmup = 220
    regime_affinity = TREND_AFFINITY

    def __init__(self, adx_min: float = 20.0, pullback_atr: float = 1.0, **kw):
        super().__init__(adx_min=adx_min, pullback_atr=pullback_atr, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        fast, mid, slow = view.f("ema_fast"), view.f("ema_mid"), view.f("ema_slow")
        atr, adx, close = view.f("atr"), view.f("adx"), view.close
        if not all(np.isfinite(x) for x in (fast, mid, slow, atr, adx)) or atr <= 0:
            return self.flat("warmup")
        if adx < self.adx_min:
            return self.flat("adx_too_low")

        distance = (close - fast) / atr
        long_stack = fast > mid > slow
        short_stack = fast < mid < slow

        if long_stack and -self.pullback_atr <= distance <= 0.6:
            strength = min(1.0, (adx - self.adx_min) / 20.0)
            depth = min(1.0, abs(distance) / self.pullback_atr) if distance < 0 else 0.4
            confidence = 0.45 + 0.35 * strength + 0.20 * depth
            return self.signal(
                Direction.LONG,
                confidence,
                f"ribbon up, pullback {distance:.2f} ATR, ADX {adx:.0f}",
                stop_hint=min(view.f("swing_low"), close - 1.5 * atr),
            )
        if short_stack and -0.6 <= distance <= self.pullback_atr:
            strength = min(1.0, (adx - self.adx_min) / 20.0)
            depth = min(1.0, abs(distance) / self.pullback_atr) if distance > 0 else 0.4
            confidence = 0.45 + 0.35 * strength + 0.20 * depth
            return self.signal(
                Direction.SHORT,
                confidence,
                f"ribbon down, pullback {distance:.2f} ATR, ADX {adx:.0f}",
                stop_hint=max(view.f("swing_high"), close + 1.5 * atr),
            )
        return self.flat("no_setup")


class SupertrendPullback(Strategy):
    """Supertrend direction plus a momentum re-entry.

    The flip bar itself is often the worst fill of the move, so this waits for
    the trend to survive a few bars and for RSI to reset out of the extreme.
    """

    name = "supertrend"
    kind = "trend"
    warmup = 120
    regime_affinity = TREND_AFFINITY

    def __init__(self, min_bars_in_trend: int = 3, **kw):
        super().__init__(min_bars_in_trend=min_bars_in_trend, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        direction = view.f("st_dir")
        line, atr, rsi_v = view.f("st_line"), view.f("atr"), view.f("rsi")
        if not all(np.isfinite(x) for x in (direction, line, atr, rsi_v)) or atr <= 0:
            return self.flat("warmup")

        bars_in_trend = 0
        for offset in range(1, 25):
            if view.f("st_dir", offset) != direction:
                break
            bars_in_trend += 1
        if bars_in_trend < self.min_bars_in_trend:
            return self.flat("trend_too_young")

        close = view.close
        room = abs(close - line) / atr
        if room > 3.0:
            return self.flat("too_extended")

        maturity = min(1.0, bars_in_trend / 10.0)
        proximity = max(0.0, 1.0 - room / 3.0)
        confidence = 0.40 + 0.30 * maturity + 0.30 * proximity

        if direction > 0 and 40.0 <= rsi_v <= 68.0:
            return self.signal(
                Direction.LONG,
                confidence,
                f"supertrend up {bars_in_trend} bars, {room:.1f} ATR above line",
                stop_hint=line - 0.25 * atr,
            )
        if direction < 0 and 32.0 <= rsi_v <= 60.0:
            return self.signal(
                Direction.SHORT,
                confidence,
                f"supertrend down {bars_in_trend} bars, {room:.1f} ATR below line",
                stop_hint=line + 0.25 * atr,
            )
        return self.flat("rsi_out_of_band")


class MacdMomentum(Strategy):
    """MACD histogram turning back in the direction of the higher-timeframe bias.

    Appel's oscillator on its own is a whipsaw machine on gold; gating it on the
    4H bias turns it into a timing tool for an already-decided direction.
    """

    name = "macd_momentum"
    kind = "momentum"
    warmup = 220
    regime_affinity = TREND_AFFINITY

    def generate(self, view: MarketView) -> StrategySignal:
        hist, prev, prev2 = (
            view.f("macd_hist"),
            view.f("macd_hist", 1),
            view.f("macd_hist", 2),
        )
        line, signal_line = view.f("macd"), view.f("macd_signal")
        atr = view.f("atr")
        bias = view.f("htf_4h_bias")
        if not all(np.isfinite(x) for x in (hist, prev, prev2, line, signal_line, atr)):
            return self.flat("warmup")
        if not np.isfinite(bias):
            bias = np.sign(view.f("trend_bias"))

        turning_up = prev2 > prev < hist and hist > prev
        turning_down = prev2 < prev > hist and hist < prev
        magnitude = min(1.0, abs(hist) / (0.25 * atr)) if atr > 0 else 0.0

        if turning_up and line > signal_line and bias >= 0:
            return self.signal(
                Direction.LONG,
                0.40 + 0.35 * magnitude + (0.15 if bias > 0 else 0.0),
                "MACD histogram turning up with 4H bias",
                stop_hint=view.f("swing_low"),
            )
        if turning_down and line < signal_line and bias <= 0:
            return self.signal(
                Direction.SHORT,
                0.40 + 0.35 * magnitude + (0.15 if bias < 0 else 0.0),
                "MACD histogram turning down with 4H bias",
                stop_hint=view.f("swing_high"),
            )
        return self.flat("no_turn")


class DonchianTurtle(Strategy):
    """The Turtle breakout (Dennis & Eckhardt), with the original ATR stop.

    Kept close to the 1983 rules: enter on a 20-bar channel break, stop 2N
    behind, and stand aside when volatility has already exploded — the one
    filter the original system paid dearly for lacking.
    """

    name = "turtle"
    kind = "breakout"
    warmup = 220
    regime_affinity = BREAKOUT_AFFINITY

    def __init__(self, entry_period: int = 20, vol_rank_max: float = 0.92, **kw):
        super().__init__(entry_period=entry_period, vol_rank_max=vol_rank_max, **kw)

    def generate(self, view: MarketView) -> StrategySignal:
        upper, lower = view.f("dc_upper"), view.f("dc_lower")
        atr, close = view.f("atr"), view.close
        vol_rank = view.f("atr_rank")
        if not all(np.isfinite(x) for x in (upper, lower, atr)) or atr <= 0:
            return self.flat("warmup")
        if np.isfinite(vol_rank) and vol_rank > self.vol_rank_max:
            return self.flat("volatility_blowout")

        # Require the break to close beyond the channel, not just wick through.
        prev_close = view.bar("close", 1)
        if close > upper and prev_close <= upper:
            extension = (close - upper) / atr
            if extension > 1.5:
                return self.flat("gap_through")
            return self.signal(
                Direction.LONG,
                0.55 + 0.25 * min(1.0, view.f("er") / 0.5 if np.isfinite(view.f("er")) else 0.4),
                f"20-bar breakout above {upper:.2f}",
                stop_hint=close - 2.0 * atr,
                target_hint=close + 4.0 * atr,
            )
        if close < lower and prev_close >= lower:
            extension = (lower - close) / atr
            if extension > 1.5:
                return self.flat("gap_through")
            return self.signal(
                Direction.SHORT,
                0.55 + 0.25 * min(1.0, view.f("er") / 0.5 if np.isfinite(view.f("er")) else 0.4),
                f"20-bar breakdown below {lower:.2f}",
                stop_hint=close + 2.0 * atr,
                target_hint=close - 4.0 * atr,
            )
        return self.flat("inside_channel")


class HtfAlignmentTrend(Strategy):
    """Multi-timeframe alignment: daily bias, 4H trigger, entry-timeframe timing.

    This is the desk version of "trade with the daily" — it contributes little
    on its own but strongly reinforces the other trend voters when all three
    timeframes agree, which is exactly what the ensemble needs from it.
    """

    name = "htf_alignment"
    kind = "trend"
    warmup = 260
    regime_affinity = TREND_AFFINITY

    def generate(self, view: MarketView) -> StrategySignal:
        d1 = view.f("htf_1d_bias")
        h4 = view.f("htf_4h_bias")
        h4_adx = view.f("htf_4h_adx")
        bias = view.f("trend_bias")
        rsi_v = view.f("rsi")
        if not np.isfinite(bias) or not np.isfinite(rsi_v):
            return self.flat("warmup")
        d1 = 0.0 if not np.isfinite(d1) else d1
        h4 = 0.0 if not np.isfinite(h4) else h4
        adx_bonus = 0.0
        if np.isfinite(h4_adx):
            adx_bonus = min(0.2, max(0.0, (h4_adx - 20.0) / 100.0))

        aligned_long = d1 > 0 and h4 > 0 and bias > 0.2
        aligned_short = d1 < 0 and h4 < 0 and bias < -0.2

        if aligned_long and rsi_v < 70.0:
            return self.signal(
                Direction.LONG,
                0.45 + 0.25 * min(1.0, bias) + adx_bonus,
                "D1 + 4H + entry TF all long",
                stop_hint=view.f("swing_low"),
            )
        if aligned_short and rsi_v > 30.0:
            return self.signal(
                Direction.SHORT,
                0.45 + 0.25 * min(1.0, abs(bias)) + adx_bonus,
                "D1 + 4H + entry TF all short",
                stop_hint=view.f("swing_high"),
            )
        return self.flat("timeframes_disagree")
