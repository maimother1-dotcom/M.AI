"""OANDA v20 REST feed.

The cross-platform alternative to MT5: works on macOS and Linux, needs only an
API token, and quotes XAU_USD directly. Uses urllib so the bot picks up no
extra dependency for it.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

import pandas as pd

from .base import DataFeed, normalise

GRANULARITY = {
    "M1": "M1",
    "M5": "M5",
    "M15": "M15",
    "M30": "M30",
    "H1": "H1",
    "H4": "H4",
    "D1": "D",
}

HOSTS = {
    "practice": "https://api-fxpractice.oanda.com",
    "live": "https://api-fxtrade.oanda.com",
}


class OandaClient:
    """Thin v20 REST client shared by the feed and the broker."""

    def __init__(self, token: str, account_id: str, environment: str = "practice", timeout: int = 20):
        if environment not in HOSTS:
            raise ValueError(f"environment must be one of {list(HOSTS)}")
        self.host = HOSTS[environment]
        self.token = token
        self.account_id = account_id
        self.timeout = timeout

    def request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        body: Optional[dict] = None,
    ) -> dict:
        url = f"{self.host}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept-Datetime-Format", "RFC3339")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as exc:  # surface the API's own message
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"OANDA {method} {path} -> {exc.code}: {detail}") from exc


class OandaFeed(DataFeed):
    def __init__(
        self,
        client: OandaClient,
        symbol: str = "XAU_USD",
    ) -> None:
        self.client = client
        self.symbol = symbol

    def history(self, timeframe: str, bars: int) -> pd.DataFrame:
        granularity = GRANULARITY.get(timeframe.upper())
        if granularity is None:
            raise ValueError(f"unsupported timeframe {timeframe}")
        frames = []
        remaining = int(bars)
        to_time: Optional[str] = None
        # v20 caps a single request at 5000 candles.
        while remaining > 0:
            count = min(5000, remaining)
            params = {
                "granularity": granularity,
                "count": count,
                "price": "M",
                # complete=true only; an in-progress candle would leak the future.
            }
            if to_time:
                params["to"] = to_time
            payload = self.client.request(
                "GET", f"/v3/instruments/{self.symbol}/candles", params=params
            )
            candles = [c for c in payload.get("candles", []) if c.get("complete")]
            if not candles:
                break
            frames.append(candles)
            to_time = candles[0]["time"]
            remaining -= len(candles)
            if len(candles) < count:
                break

        rows = [c for chunk in reversed(frames) for c in chunk]
        if not rows:
            raise RuntimeError("OANDA returned no candles")
        df = pd.DataFrame(
            {
                "time": [r["time"] for r in rows],
                "open": [float(r["mid"]["o"]) for r in rows],
                "high": [float(r["mid"]["h"]) for r in rows],
                "low": [float(r["mid"]["l"]) for r in rows],
                "close": [float(r["mid"]["c"]) for r in rows],
                "volume": [float(r.get("volume", 0)) for r in rows],
            }
        )
        return normalise(df).iloc[-bars:]

    def spread(self) -> Optional[float]:
        payload = self.client.request(
            "GET",
            f"/v3/accounts/{self.client.account_id}/pricing",
            params={"instruments": self.symbol},
        )
        prices = payload.get("prices", [])
        if not prices:
            return None
        bids = prices[0].get("bids", [])
        asks = prices[0].get("asks", [])
        if not bids or not asks:
            return None
        return float(asks[0]["price"]) - float(bids[0]["price"])
