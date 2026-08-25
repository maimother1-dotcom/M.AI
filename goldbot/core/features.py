"""Feature engineering and market-regime classification.

Features are computed once for the whole series and then read bar by bar. The
alternative — every strategy recomputing its own ATR on every bar — is both
slower and a source of subtle disagreement between strategies about what
"the ATR" is.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from . import indicators as ind
from .types import Regime

OHLC_AGG = {
    "open": "first",
    "high": "max",
    "low": "min",
    "close": "last",
    "volume": "sum",
}


def resample_ohlc(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    out = df.resample(rule, label="left", closed="left").agg(OHLC_AGG)
    return out.dropna(subset=["open", "high", "low", "close"])


def align_htf(base_index: pd.DatetimeIndex, htf: pd.DataFrame) -> pd.DataFrame:
    """Project a higher-timeframe frame onto the base index without leaking.

    The HTF bar covering the current base bar is still forming, so it is shifted
    out; each base bar sees only the last *closed* HTF bar.
    """
    shifted = htf.shift(1)
    return shifted.reindex(base_index, method="ffill")


@dataclass
class FeatureConfig:
    atr_period: int = 14
    rsi_period: int = 14
    adx_period: int = 14
    er_period: int = 20
    fast_ema: int = 21
    mid_ema: int = 50
    slow_ema: int = 200
    bb_period: int = 20
    bb_mult: float = 2.0
    kc_period: int = 20
    kc_mult: float = 1.5
    donchian_period: int = 20
    swing_left: int = 3
    swing_right: int = 3
    vol_rank_period: int = 200
    htf_rules: tuple[str, ...] = ("4h", "1D")
    # Regime thresholds, tuned on gold: it trends hard but reverts violently.
    adx_trend: float = 25.0
    adx_weak: float = 18.0
    er_trend: float = 0.35
    chop_vol_rank: float = 0.80


def build_features(df: pd.DataFrame, cfg: Optional[FeatureConfig] = None) -> pd.DataFrame:
    """Return a feature frame aligned to `df`'s index.

    `df` must be UTC-indexed with open/high/low/close/volume columns, sorted
    ascending, one row per closed bar.
    """
    cfg = cfg or FeatureConfig()
    f = pd.DataFrame(index=df.index)

    close = df["close"]
    f["atr"] = ind.atr(df, cfg.atr_period)
    f["atr_pct"] = f["atr"] / close * 100.0
    f["atr_rank"] = ind.percent_rank(f["atr"], cfg.vol_rank_period)
    f["tr"] = ind.true_range(df)

    f["ema_fast"] = ind.ema(close, cfg.fast_ema)
    f["ema_mid"] = ind.ema(close, cfg.mid_ema)
    f["ema_slow"] = ind.ema(close, cfg.slow_ema)
    f["hma"] = ind.hma(close, cfg.mid_ema)
    f["slope_fast"] = ind.slope(f["ema_fast"], 10)

    f["rsi"] = ind.rsi(close, cfg.rsi_period)
    f["rsi2"] = ind.rsi(close, 2)
    f["stoch_k"], f["stoch_d"] = ind.stochastic(df)
    f["cci"] = ind.cci(df)
    f["macd"], f["macd_signal"], f["macd_hist"] = ind.macd(close)

    f["adx"], f["di_plus"], f["di_minus"] = ind.adx(df, cfg.adx_period)
    f["er"] = ind.efficiency_ratio(close, cfg.er_period)

    f["bb_upper"], f["bb_mid"], f["bb_lower"] = ind.bollinger(
        close, cfg.bb_period, cfg.bb_mult
    )
    f["bb_width"] = (f["bb_upper"] - f["bb_lower"]) / f["bb_mid"] * 100.0
    f["bb_width_rank"] = ind.percent_rank(f["bb_width"], 100)
    f["kc_upper"], f["kc_mid"], f["kc_lower"] = ind.keltner(
        df, cfg.kc_period, cfg.kc_mult
    )
    # Squeeze: Bollinger inside Keltner, the classic pre-expansion state.
    f["squeeze"] = (f["bb_upper"] < f["kc_upper"]) & (f["bb_lower"] > f["kc_lower"])

    f["dc_upper"], f["dc_mid"], f["dc_lower"] = ind.donchian(df, cfg.donchian_period)
    f["dc_upper_55"], _, f["dc_lower_55"] = ind.donchian(df, 55)

    f["st_line"], f["st_dir"] = ind.supertrend(df)

    f["swing_high"] = ind.swing_high(df, cfg.swing_left, cfg.swing_right)
    f["swing_low"] = ind.swing_low(df, cfg.swing_left, cfg.swing_right)

    day_key = pd.Series(df.index.date, index=df.index)
    f["vwap"] = ind.session_vwap(df, day_key)
    f["vwap_dist_atr"] = (close - f["vwap"]) / f["atr"].replace(0.0, np.nan)

    # Prior-day levels: the reference every gold desk quotes.
    daily = resample_ohlc(df, "1D")
    daily_prev = daily.shift(1)
    f["pd_high"] = daily_prev["high"].reindex(df.index, method="ffill")
    f["pd_low"] = daily_prev["low"].reindex(df.index, method="ffill")
    f["pd_close"] = daily_prev["close"].reindex(df.index, method="ffill")
    pivot = (f["pd_high"] + f["pd_low"] + f["pd_close"]) / 3.0
    f["pivot"] = pivot
    f["pivot_r1"] = 2 * pivot - f["pd_low"]
    f["pivot_s1"] = 2 * pivot - f["pd_high"]

    for rule in cfg.htf_rules:
        htf = resample_ohlc(df, rule)
        if len(htf) < cfg.slow_ema // 4:
            continue
        htf_feat = pd.DataFrame(index=htf.index)
        htf_feat["close"] = htf["close"]
        htf_feat["ema_fast"] = ind.ema(htf["close"], 21)
        htf_feat["ema_slow"] = ind.ema(htf["close"], 50)
        htf_feat["atr"] = ind.atr(htf, 14)
        htf_feat["rsi"] = ind.rsi(htf["close"], 14)
        htf_adx, _, _ = ind.adx(htf, 14)
        htf_feat["adx"] = htf_adx
        aligned = align_htf(df.index, htf_feat)
        tag = rule.lower().replace(" ", "")
        for col in aligned.columns:
            f[f"htf_{tag}_{col}"] = aligned[col]
        f[f"htf_{tag}_bias"] = np.sign(
            (aligned["ema_fast"] - aligned["ema_slow"]).fillna(0.0)
        )

    f["regime"] = classify_regime(f, cfg)
    f["trend_bias"] = trend_bias(f)
    return f


def classify_regime(f: pd.DataFrame, cfg: FeatureConfig) -> pd.Series:
    """Four-state regime. Trend strategies are weighted up in the trend states,
    fade strategies in RANGE, and everything is scaled down in VOLATILE_CHOP."""
    adx = f["adx"]
    er = f["er"]
    vol_rank = f["atr_rank"]

    regime = pd.Series(Regime.RANGE.value, index=f.index, dtype=object)
    strong = (adx >= cfg.adx_trend) & (er >= cfg.er_trend)
    weak = (~strong) & (adx >= cfg.adx_weak)
    chop = (vol_rank >= cfg.chop_vol_rank) & (er < cfg.er_trend * 0.6)

    regime[weak.fillna(False)] = Regime.WEAK_TREND.value
    regime[strong.fillna(False)] = Regime.STRONG_TREND.value
    regime[chop.fillna(False)] = Regime.VOLATILE_CHOP.value
    return regime


def trend_bias(f: pd.DataFrame) -> pd.Series:
    """Blended directional bias in [-1, 1] from stacked EMAs, Supertrend, DI
    spread and any higher timeframes present."""
    parts: list[pd.Series] = []
    stack = np.sign(f["ema_fast"] - f["ema_mid"]) + np.sign(f["ema_mid"] - f["ema_slow"])
    parts.append(stack / 2.0)
    parts.append(f["st_dir"].fillna(0.0))
    di_spread = (f["di_plus"] - f["di_minus"]) / 40.0
    parts.append(di_spread.clip(-1.0, 1.0))
    for col in f.columns:
        if col.endswith("_bias"):
            parts.append(f[col].fillna(0.0))
    blended = sum(p.fillna(0.0) for p in parts) / float(len(parts))
    return blended.clip(-1.0, 1.0)


@dataclass
class MarketView:
    """Everything a strategy is allowed to see on the current bar.

    Strategies are handed a MarketView and nothing else. Because `i` is the
    index of the last *closed* bar and no method exposes anything past it,
    a strategy physically cannot peek into the future.
    """

    df: pd.DataFrame
    features: pd.DataFrame
    i: int
    symbol: str = "XAUUSD"
    spread: float = 0.30

    @property
    def index(self) -> pd.Timestamp:
        return self.df.index[self.i]

    @property
    def time(self):
        return self.index.to_pydatetime()

    @property
    def close(self) -> float:
        return float(self.df["close"].iat[self.i])

    @property
    def open(self) -> float:
        return float(self.df["open"].iat[self.i])

    @property
    def high(self) -> float:
        return float(self.df["high"].iat[self.i])

    @property
    def low(self) -> float:
        return float(self.df["low"].iat[self.i])

    @property
    def regime(self) -> Regime:
        value = self.features["regime"].iat[self.i]
        try:
            return Regime(value)
        except ValueError:
            return Regime.RANGE

    def f(self, column: str, offset: int = 0) -> float:
        """Feature value `offset` bars back. NaN when unavailable."""
        j = self.i - offset
        if j < 0 or column not in self.features.columns:
            return float("nan")
        value = self.features[column].iat[j]
        try:
            return float(value)
        except (TypeError, ValueError):
            return float("nan")

    def b(self, column: str, offset: int = 0) -> bool:
        value = self.f(column, offset)
        return bool(value) and value == value

    def bar(self, column: str, offset: int = 0) -> float:
        j = self.i - offset
        if j < 0:
            return float("nan")
        return float(self.df[column].iat[j])

    def window(self, column: str, length: int) -> np.ndarray:
        start = max(0, self.i - length + 1)
        source = self.df if column in self.df.columns else self.features
        return source[column].iloc[start : self.i + 1].to_numpy(dtype=float)

    def ready(self, required: int = 250) -> bool:
        return self.i >= required and self.f("atr") == self.f("atr")
