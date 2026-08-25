"""CSV / Parquet history.

The path most users take: export XAUUSD bars from MetaTrader (or any vendor)
and point the backtester at the file. Column naming is forgiving — see
`normalise` — so a raw MT5 export works without editing.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .base import DataFeed, drop_weekend, normalise


class CsvFeed(DataFeed):
    def __init__(
        self,
        path: str | Path,
        symbol: str = "XAUUSD",
        timeframe: str = "M15",
        drop_closed: bool = True,
        spread_estimate: float = 0.30,
    ) -> None:
        self.path = Path(path)
        self.symbol = symbol
        self.timeframe = timeframe.upper()
        self._spread = spread_estimate
        if not self.path.exists():
            raise FileNotFoundError(self.path)
        self._df = self._load(drop_closed)

    def _load(self, drop_closed: bool) -> pd.DataFrame:
        suffix = self.path.suffix.lower()
        if suffix in {".parquet", ".pq"}:
            raw = pd.read_parquet(self.path)
        else:
            # MT5 exports are tab-separated with a <DATE>/<TIME> pair.
            raw = pd.read_csv(self.path, sep=None, engine="python")
            columns = {str(c).strip().lower().strip("<>") for c in raw.columns}
            if {"date", "time"} <= columns:
                raw.columns = [str(c).strip().lower().strip("<>") for c in raw.columns]
                raw["time"] = pd.to_datetime(
                    raw["date"].astype(str) + " " + raw["time"].astype(str),
                    utc=True,
                    errors="coerce",
                )
                raw = raw.drop(columns=["date"])
        df = normalise(raw)
        return drop_weekend(df) if drop_closed else df

    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        if timeframe.upper() != self.timeframe:
            raise ValueError(
                f"{self.path.name} holds {self.timeframe}, asked for {timeframe}"
            )
        return self._df.iloc[-bars:].copy() if bars else self._df.copy()

    def full(self) -> pd.DataFrame:
        return self._df.copy()

    def spread(self) -> float:
        return self._spread


def write_csv(df: pd.DataFrame, path: str | Path) -> Path:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    frame = df.copy()
    frame.index.name = "time"
    frame.to_csv(out)
    return out
