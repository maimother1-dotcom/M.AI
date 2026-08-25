"""Data feed contract and OHLC hygiene.

Everything downstream assumes: a UTC DatetimeIndex, ascending, unique, with
open/high/low/close/volume floats and no bars where high < low. `normalise`
is the one place that guarantee is enforced, and every feed routes through it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

import pandas as pd

REQUIRED_COLUMNS = ("open", "high", "low", "close", "volume")

TIMEFRAME_MINUTES: dict[str, int] = {
    "M1": 1,
    "M5": 5,
    "M15": 15,
    "M30": 30,
    "H1": 60,
    "H4": 240,
    "D1": 1440,
}

TIMEFRAME_PANDAS: dict[str, str] = {
    "M1": "1min",
    "M5": "5min",
    "M15": "15min",
    "M30": "30min",
    "H1": "1h",
    "H4": "4h",
    "D1": "1D",
}


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce any reasonably-shaped OHLC frame into the canonical form."""
    out = df.copy()
    out.columns = [str(c).strip().lower() for c in out.columns]

    aliases = {
        "date": "time",
        "datetime": "time",
        "timestamp": "time",
        "o": "open",
        "h": "high",
        "l": "low",
        "c": "close",
        "v": "volume",
        "tick_volume": "volume",
        "vol": "volume",
        "adj close": "close",
        "price": "close",
    }
    out = out.rename(columns={k: v for k, v in aliases.items() if k in out.columns})

    if not isinstance(out.index, pd.DatetimeIndex):
        if "time" not in out.columns:
            raise ValueError("no time column and no DatetimeIndex")
        out["time"] = pd.to_datetime(out["time"], utc=True, errors="coerce")
        out = out.dropna(subset=["time"]).set_index("time")
    if out.index.tz is None:
        out.index = out.index.tz_localize("UTC")
    else:
        out.index = out.index.tz_convert("UTC")

    if "volume" not in out.columns:
        out["volume"] = 0.0
    missing = [c for c in REQUIRED_COLUMNS if c not in out.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")

    out = out[list(REQUIRED_COLUMNS)].astype(float)
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out = out.dropna(subset=["open", "high", "low", "close"])

    # Repair impossible bars rather than dropping them: a feed glitch should
    # not silently delete a bar the strategies expect to exist.
    out["high"] = out[["open", "high", "low", "close"]].max(axis=1)
    out["low"] = out[["open", "high", "low", "close"]].min(axis=1)
    return out


def drop_weekend(df: pd.DataFrame) -> pd.DataFrame:
    """Remove bars when the gold market is shut (Fri 21:00 → Sun 22:00 UTC)."""
    idx = df.index
    weekday = idx.dayofweek
    hour = idx.hour
    closed = (
        (weekday == 5)
        | ((weekday == 4) & (hour >= 21))
        | ((weekday == 6) & (hour < 22))
    )
    return df[~closed]


class DataFeed(ABC):
    """Source of bars. Backtests use `history`; the live engine polls `latest`."""

    symbol: str = "XAUUSD"

    @abstractmethod
    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        ...

    def latest(self, timeframe: str, bars: int = 500) -> pd.DataFrame:
        return self.history(timeframe, bars)

    def spread(self) -> Optional[float]:
        """Current bid/ask spread in dollars, when the source knows it."""
        return None

    def close(self) -> None:
        return None
