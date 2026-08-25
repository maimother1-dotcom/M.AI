"""Feed hygiene: whatever comes in, canonical OHLC comes out."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from goldbot.data.base import drop_weekend, normalise
from goldbot.data.csv_feed import CsvFeed, write_csv
from goldbot.data.replay import ReplayFeed
from goldbot.data.synthetic import generate


def test_normalise_accepts_mt5_style_columns():
    raw = pd.DataFrame(
        {
            "DATE": ["2024.01.02", "2024.01.02"],
            "TIME": ["10:00:00", "10:15:00"],
            "OPEN": [2000.0, 2001.0],
            "HIGH": [2002.0, 2003.0],
            "LOW": [1999.0, 2000.5],
            "CLOSE": [2001.0, 2002.5],
            "TICKVOL": [100, 120],
        }
    )
    raw.columns = [c.lower() for c in raw.columns]
    raw["time"] = pd.to_datetime(raw["date"] + " " + raw["time"], format="%Y.%m.%d %H:%M:%S")
    frame = normalise(raw.drop(columns=["date", "tickvol"]).assign(volume=[100, 120]))
    assert list(frame.columns) == ["open", "high", "low", "close", "volume"]
    assert frame.index.tz is not None


def test_normalise_repairs_impossible_bars():
    index = pd.date_range("2024-01-02", periods=2, freq="15min", tz="UTC")
    raw = pd.DataFrame(
        {"open": [2000, 2000], "high": [1995, 2005], "low": [2005, 1995], "close": [2001, 2001]},
        index=index,
    )
    frame = normalise(raw)
    assert (frame["high"] >= frame["low"]).all()
    assert (frame["high"] >= frame[["open", "close"]].max(axis=1)).all()


def test_normalise_sorts_and_deduplicates():
    index = pd.DatetimeIndex(
        ["2024-01-02T10:15", "2024-01-02T10:00", "2024-01-02T10:15"], tz="UTC"
    )
    raw = pd.DataFrame(
        {"open": [1, 2, 3], "high": [1, 2, 3], "low": [1, 2, 3], "close": [1, 2, 3]},
        index=index,
    )
    frame = normalise(raw)
    assert len(frame) == 2
    assert frame.index.is_monotonic_increasing


def test_drop_weekend_removes_closed_hours():
    index = pd.date_range("2024-01-05T18:00", periods=80, freq="1h", tz="UTC")
    raw = pd.DataFrame(
        {"open": 2000.0, "high": 2001.0, "low": 1999.0, "close": 2000.5, "volume": 1.0},
        index=index,
    )
    frame = drop_weekend(raw)
    assert not (frame.index.dayofweek == 5).any()
    assert not ((frame.index.dayofweek == 4) & (frame.index.hour >= 21)).any()


def test_synthetic_data_looks_like_gold():
    df = generate(bars=12000, seed=3)
    returns = np.log(df["close"] / df["close"].shift(1)).dropna()
    years = (df.index[-1] - df.index[0]).days / 365.25
    bars_per_year = len(df) / years
    annual_vol = returns.std() * np.sqrt(bars_per_year)
    assert 0.08 < annual_vol < 0.30, f"annualised vol {annual_vol:.2%} is not gold-like"
    assert (df["high"] >= df["low"]).all()
    assert not (df.index.dayofweek == 5).any()


def test_csv_round_trip(tmp_path):
    df = generate(bars=600, seed=4)
    path = write_csv(df, tmp_path / "x.csv")
    feed = CsvFeed(path)
    loaded = feed.full()
    assert len(loaded) == len(df)
    assert loaded["close"].iloc[-1] == pytest.approx(df["close"].iloc[-1])


def test_replay_serves_each_bar_once_and_never_the_future():
    df = generate(bars=800, seed=6)
    feed = ReplayFeed(df, start_at=400)
    first = feed.latest("M15", 100)
    second = feed.latest("M15", 100)
    assert first.index[-1] < second.index[-1]
    assert second.index[-1] <= df.index[-1]
    while not feed.exhausted:
        feed.latest("M15", 50)
    assert feed.progress[0] == feed.progress[1]
