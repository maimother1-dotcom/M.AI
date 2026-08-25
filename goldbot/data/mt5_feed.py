"""MetaTrader 5 bar feed.

MT5 is how most retail gold accounts are actually reachable. The package is
Windows-only, so it is imported lazily: the rest of the bot — backtests,
paper trading, tests — runs anywhere without it installed.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from .base import DataFeed, normalise

MT5_TIMEFRAMES = {
    "M1": "TIMEFRAME_M1",
    "M5": "TIMEFRAME_M5",
    "M15": "TIMEFRAME_M15",
    "M30": "TIMEFRAME_M30",
    "H1": "TIMEFRAME_H1",
    "H4": "TIMEFRAME_H4",
    "D1": "TIMEFRAME_D1",
}


def import_mt5():
    try:
        import MetaTrader5 as mt5  # type: ignore
    except ImportError as exc:  # pragma: no cover - platform dependent
        raise RuntimeError(
            "MetaTrader5 package not installed. It is Windows-only: "
            "`pip install MetaTrader5`, or use the OANDA broker instead."
        ) from exc
    return mt5


def connect(
    login: Optional[int] = None,
    password: Optional[str] = None,
    server: Optional[str] = None,
    path: Optional[str] = None,
):
    """Initialise the terminal connection. Idempotent."""
    mt5 = import_mt5()
    kwargs = {}
    if path:
        kwargs["path"] = path
    if login:
        kwargs.update(login=int(login), password=password, server=server)
    if not mt5.initialize(**kwargs):
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
    return mt5


class MT5Feed(DataFeed):
    def __init__(
        self,
        symbol: str = "XAUUSD",
        login: Optional[int] = None,
        password: Optional[str] = None,
        server: Optional[str] = None,
        path: Optional[str] = None,
    ) -> None:
        self.mt5 = connect(login, password, server, path)
        self.symbol = self._resolve_symbol(symbol)

    def _resolve_symbol(self, symbol: str) -> str:
        """Brokers rename gold: XAUUSD, GOLD, XAUUSD.m, XAUUSDx. Find the real one."""
        if self.mt5.symbol_info(symbol) is not None:
            self.mt5.symbol_select(symbol, True)
            return symbol
        candidates = self.mt5.symbols_get("*XAU*") or self.mt5.symbols_get("*GOLD*") or []
        for info in candidates:
            if info.name.upper().startswith(symbol.upper()):
                self.mt5.symbol_select(info.name, True)
                return info.name
        if candidates:
            self.mt5.symbol_select(candidates[0].name, True)
            return candidates[0].name
        raise RuntimeError(f"no gold symbol found matching {symbol}")

    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        tf_name = MT5_TIMEFRAMES.get(timeframe.upper())
        if tf_name is None:
            raise ValueError(f"unsupported timeframe {timeframe}")
        tf = getattr(self.mt5, tf_name)
        # Offset 1 skips the still-forming bar: strategies only see closed bars.
        rates = self.mt5.copy_rates_from_pos(self.symbol, tf, 1, int(bars))
        if rates is None or len(rates) == 0:
            raise RuntimeError(f"MT5 returned no bars: {self.mt5.last_error()}")
        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        return normalise(df)

    def spread(self) -> Optional[float]:
        tick = self.mt5.symbol_info_tick(self.symbol)
        if tick is None:
            return None
        return float(tick.ask - tick.bid)

    def close(self) -> None:
        try:
            self.mt5.shutdown()
        except Exception:  # pragma: no cover - shutdown is best effort
            pass
