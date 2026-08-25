"""Synthetic XAUUSD generator.

Used for tests, for CI, and for a first end-to-end run before real data is
wired up. It is not a substitute for real history — it is a way to prove the
machinery works without a broker connection.

The generator reproduces the features of gold that actually matter to this
bot: session-dependent volatility (thin Asia, expansion at the London and New
York opens), regime persistence (trends that last, then break), fat-tailed
shocks, and no bars over the weekend.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import TIMEFRAME_MINUTES, drop_weekend, normalise

# Relative volatility by UTC hour: Asia quiet, London open and NY open loud.
HOURLY_VOL = np.array(
    [
        0.55, 0.50, 0.48, 0.50, 0.55, 0.65, 0.80, 1.15,  # 00-07
        1.30, 1.20, 1.05, 0.95, 1.35, 1.55, 1.45, 1.25,  # 08-15
        1.10, 0.95, 0.85, 0.75, 0.65, 0.55, 0.55, 0.55,  # 16-23
    ]
)


def generate(
    bars: int = 20000,
    timeframe: str = "M15",
    start: str = "2023-01-02 00:00",
    start_price: float = 1950.0,
    seed: int = 7,
    annual_drift: float = 0.08,
    base_vol_bp: float = 4.7,
) -> pd.DataFrame:
    """Generate `bars` of synthetic XAUUSD OHLCV.

    `base_vol_bp` is the per-bar standard deviation in basis points before the
    session and regime multipliers; the default puts realised volatility at
    roughly 15% annualised, which is where gold has lived since 2020.
    """
    rng = np.random.default_rng(seed)
    minutes = TIMEFRAME_MINUTES.get(timeframe.upper(), 15)
    # Over-generate, because weekend bars get dropped afterwards.
    raw_bars = int(bars * 1.45) + 500
    index = pd.date_range(start=start, periods=raw_bars, freq=f"{minutes}min", tz="UTC")

    bars_per_year = 365 * 24 * 60 / minutes
    drift = annual_drift / bars_per_year

    # Two-state volatility regime with sticky transitions.
    calm_to_wild, wild_to_calm = 0.004, 0.03
    regime = np.zeros(raw_bars, dtype=int)
    for i in range(1, raw_bars):
        p = calm_to_wild if regime[i - 1] == 0 else 1.0 - wild_to_calm
        regime[i] = 1 if rng.random() < p else 0
    regime_mult = np.where(regime == 1, 1.7, 1.0)

    # Slow-moving trend component: gold trends, it does not random-walk cleanly.
    trend_state = np.zeros(raw_bars)
    trend = 0.0
    for i in range(raw_bars):
        if rng.random() < 0.0025:
            trend = rng.normal(0.0, 1.0)
        trend *= 0.9985
        trend_state[i] = trend

    hour_mult = HOURLY_VOL[index.hour.to_numpy()]
    sigma = (base_vol_bp / 10000.0) * hour_mult * regime_mult

    # t(6) keeps the fat tails gold really has while staying finite-kurtosis;
    # t(4) produces outliers that dominate the realised volatility.
    shocks = rng.standard_t(df=6, size=raw_bars) / np.sqrt(6 / 4.0)
    returns = drift + sigma * shocks + trend_state * sigma * 0.30

    # Weekend gaps: the Sunday reopen does not start where Friday closed.
    is_sunday_open = (index.dayofweek == 6) & (index.hour == 22)
    returns = np.where(
        is_sunday_open, returns + rng.normal(0, 0.0025, raw_bars), returns
    )

    close = start_price * np.exp(np.cumsum(returns))
    open_ = np.empty_like(close)
    open_[0] = start_price
    open_[1:] = close[:-1]

    # Wicks scale with the bar's own volatility, with the usual asymmetry.
    wick = np.abs(rng.normal(0, 1, raw_bars)) * sigma * close * 0.9
    body_high = np.maximum(open_, close)
    body_low = np.minimum(open_, close)
    high = body_high + wick * rng.uniform(0.2, 1.0, raw_bars)
    low = body_low - wick * rng.uniform(0.2, 1.0, raw_bars)

    volume = (
        1000 * hour_mult * regime_mult * rng.lognormal(0, 0.35, raw_bars)
    ).round()

    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )
    df = drop_weekend(normalise(df))
    return df.iloc[-bars:] if len(df) > bars else df


class SyntheticFeed:
    """DataFeed-compatible wrapper around the generator."""

    symbol = "XAUUSD"

    def __init__(self, bars: int = 20000, timeframe: str = "M15", seed: int = 7):
        self._df = generate(bars=bars, timeframe=timeframe, seed=seed)
        self._timeframe = timeframe

    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        if timeframe.upper() != self._timeframe.upper():
            raise ValueError(f"synthetic feed holds {self._timeframe}, not {timeframe}")
        return self._df.iloc[-bars:].copy()

    def latest(self, timeframe: str, bars: int = 500) -> pd.DataFrame:
        return self.history(timeframe, bars)

    def spread(self) -> float:
        return 0.28

    def close(self) -> None:
        return None
