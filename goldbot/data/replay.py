"""Replay feed: step a stored history forward as if it were live.

This is how the live engine gets exercised without waiting days for real bars.
The feed hands out one more bar on each call, so `goldbot paper --replay` runs
the *live* code path — engine loop, broker, journal, notifications — over
historical data, and any divergence between the engine and the backtester
shows up immediately instead of on a funded account.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from .base import DataFeed


class ReplayFeed(DataFeed):
    def __init__(
        self,
        df: pd.DataFrame,
        symbol: str = "XAUUSD",
        timeframe: str = "M15",
        start_at: int = 400,
        spread: float = 0.28,
        step: int = 1,
    ) -> None:
        if len(df) <= start_at:
            raise ValueError("not enough bars to replay")
        self.symbol = symbol
        self.timeframe = timeframe.upper()
        self._df = df
        self._cursor = start_at
        self._spread = spread
        self._step = max(1, step)

    @property
    def exhausted(self) -> bool:
        return self._cursor >= len(self._df)

    @property
    def progress(self) -> tuple[int, int]:
        return self._cursor, len(self._df)

    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        if timeframe.upper() != self.timeframe:
            raise ValueError(f"replay holds {self.timeframe}, asked for {timeframe}")
        end = min(self._cursor, len(self._df))
        start = max(0, end - bars)
        return self._df.iloc[start:end].copy()

    def latest(self, timeframe: str, bars: int = 500) -> pd.DataFrame:
        frame = self.history(timeframe, bars)
        # Advance only after serving, so the engine sees each bar exactly once.
        self._cursor = min(self._cursor + self._step, len(self._df))
        return frame

    def current_time(self):
        """Market time of the last bar served — the replay's notion of 'now'."""
        index = min(self._cursor, len(self._df)) - 1
        if index < 0:
            return None
        return self._df.index[index].to_pydatetime()

    def current_price(self) -> Optional[float]:
        index = min(self._cursor, len(self._df)) - 1
        if index < 0:
            return None
        return float(self._df["close"].iat[index])

    def spread(self) -> float:
        return self._spread

    def close(self) -> None:
        return None
