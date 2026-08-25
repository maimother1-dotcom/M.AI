"""Indicator correctness against hand-computable cases."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from goldbot.core import indicators as ind


@pytest.fixture
def frame() -> pd.DataFrame:
    index = pd.date_range("2024-01-01", periods=120, freq="15min", tz="UTC")
    rng = np.random.default_rng(3)
    close = 2000 + np.cumsum(rng.normal(0, 1.2, 120))
    high = close + np.abs(rng.normal(0, 0.8, 120))
    low = close - np.abs(rng.normal(0, 0.8, 120))
    open_ = np.concatenate([[close[0]], close[:-1]])
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": 100.0},
        index=index,
    )


def test_sma_matches_manual_mean(frame):
    result = ind.sma(frame["close"], 10)
    assert result.iloc[:9].isna().all()
    assert result.iloc[9] == pytest.approx(frame["close"].iloc[:10].mean())


def test_ema_recursion(frame):
    period = 5
    alpha = 2 / (period + 1)
    result = ind.ema(frame["close"], period)
    manual = frame["close"].iloc[:period].mean()
    # pandas seeds adjust=False from the first observation, not the SMA.
    manual = frame["close"].iloc[0]
    for value in frame["close"].iloc[1:10]:
        manual = alpha * value + (1 - alpha) * manual
    assert result.iloc[9] == pytest.approx(manual, rel=1e-9)


def test_true_range_uses_previous_close(frame):
    tr = ind.true_range(frame)
    i = 5
    expected = max(
        frame["high"].iloc[i] - frame["low"].iloc[i],
        abs(frame["high"].iloc[i] - frame["close"].iloc[i - 1]),
        abs(frame["low"].iloc[i] - frame["close"].iloc[i - 1]),
    )
    assert tr.iloc[i] == pytest.approx(expected)


def test_rsi_bounds_and_extremes(frame):
    rsi = ind.rsi(frame["close"], 14).dropna()
    assert ((rsi >= 0) & (rsi <= 100)).all()

    rising = pd.Series(np.arange(100, dtype=float) + 1.0)
    assert ind.rsi(rising, 14).iloc[-1] == pytest.approx(100.0)


def test_donchian_excludes_current_bar(frame):
    upper, _, lower = ind.donchian(frame, 20)
    i = 40
    assert upper.iloc[i] == pytest.approx(frame["high"].iloc[i - 20 : i].max())
    assert lower.iloc[i] == pytest.approx(frame["low"].iloc[i - 20 : i].min())


def test_swing_high_is_confirmed_late(frame):
    """A pivot must only appear `right` bars after it printed."""
    highs = frame["high"].copy()
    highs.iloc[50] = highs.max() + 50.0
    modified = frame.assign(high=highs)
    swing = ind.swing_high(modified, left=3, right=3)
    assert swing.iloc[52] != pytest.approx(highs.iloc[50])
    assert swing.iloc[53] == pytest.approx(highs.iloc[50])


def test_efficiency_ratio_perfect_trend():
    trend = pd.Series(np.arange(50, dtype=float))
    assert ind.efficiency_ratio(trend, 20).iloc[-1] == pytest.approx(1.0)


def test_supertrend_direction_flips_with_price():
    index = pd.date_range("2024-01-01", periods=80, freq="1h", tz="UTC")
    close = np.concatenate([np.linspace(2000, 2100, 40), np.linspace(2100, 1950, 40)])
    df = pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 1.0},
        index=index,
    )
    _, direction = ind.supertrend(df, 10, 3.0)
    assert direction.iloc[35] == 1.0
    assert direction.iloc[-1] == -1.0


def test_percent_rank_is_within_unit_interval(frame):
    ranks = ind.percent_rank(frame["close"], 30).dropna()
    assert ((ranks >= 0) & (ranks <= 1)).all()
