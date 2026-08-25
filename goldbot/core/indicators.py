"""Indicator library.

Every function takes and returns pandas objects and is *causal*: the value at
index i uses only bars 0..i. That property is what makes the backtest honest,
so any new indicator added here must preserve it (no centred windows, no
`shift(-n)`, no full-series normalisation).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# Moving averages
# --------------------------------------------------------------------------


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def wma(series: pd.Series, period: int) -> pd.Series:
    weights = np.arange(1, period + 1, dtype=float)
    return series.rolling(period, min_periods=period).apply(
        lambda w: float(np.dot(w, weights) / weights.sum()), raw=True
    )


def rma(series: pd.Series, period: int) -> pd.Series:
    """Wilder's smoothing — the average behind ATR, RSI and ADX."""
    return series.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


def hma(series: pd.Series, period: int) -> pd.Series:
    """Hull MA: fast and smooth, used by the trend-strength feature."""
    half = max(1, period // 2)
    sqrt_len = max(1, int(np.sqrt(period)))
    return wma(2 * wma(series, half) - wma(series, period), sqrt_len)


# --------------------------------------------------------------------------
# Volatility
# --------------------------------------------------------------------------


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    ranges = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    )
    return ranges.max(axis=1)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    return rma(true_range(df), period)


def realized_vol(series: pd.Series, period: int = 20, annualize: int = 0) -> pd.Series:
    returns = np.log(series / series.shift(1))
    vol = returns.rolling(period, min_periods=period).std()
    if annualize:
        vol = vol * np.sqrt(annualize)
    return vol


def bollinger(
    series: pd.Series, period: int = 20, mult: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = sma(series, period)
    sd = series.rolling(period, min_periods=period).std(ddof=0)
    return mid + mult * sd, mid, mid - mult * sd


def keltner(
    df: pd.DataFrame, period: int = 20, mult: float = 1.5, atr_period: int = 10
) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = ema(df["close"], period)
    band = atr(df, atr_period) * mult
    return mid + band, mid, mid - band


def donchian(
    df: pd.DataFrame, period: int = 20
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Prior-N-bar channel. Shifted by one so the current bar's own extreme
    cannot be the level it is meant to break."""
    upper = df["high"].rolling(period, min_periods=period).max().shift(1)
    lower = df["low"].rolling(period, min_periods=period).min().shift(1)
    return upper, (upper + lower) / 2.0, lower


# --------------------------------------------------------------------------
# Momentum / oscillators
# --------------------------------------------------------------------------


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = rma(gain, period)
    avg_loss = rma(loss, period)
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    out = 100.0 - (100.0 / (1.0 + rs))
    # A window with no losses is RSI 100 by definition, not NaN.
    return out.where(avg_loss.notna() & (avg_loss != 0.0), 100.0).where(
        avg_gain.notna(), np.nan
    )


def stoch_rsi(series: pd.Series, period: int = 14, smooth: int = 3) -> pd.Series:
    r = rsi(series, period)
    lo = r.rolling(period, min_periods=period).min()
    hi = r.rolling(period, min_periods=period).max()
    raw = (r - lo) / (hi - lo).replace(0.0, np.nan) * 100.0
    return raw.rolling(smooth, min_periods=smooth).mean()


def macd(
    series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    line = ema(series, fast) - ema(series, slow)
    sig = ema(line.fillna(0.0), signal).where(line.notna())
    return line, sig, line - sig


def stochastic(
    df: pd.DataFrame, period: int = 14, smooth_k: int = 3, smooth_d: int = 3
) -> tuple[pd.Series, pd.Series]:
    lo = df["low"].rolling(period, min_periods=period).min()
    hi = df["high"].rolling(period, min_periods=period).max()
    raw_k = (df["close"] - lo) / (hi - lo).replace(0.0, np.nan) * 100.0
    k = raw_k.rolling(smooth_k, min_periods=smooth_k).mean()
    return k, k.rolling(smooth_d, min_periods=smooth_d).mean()


def cci(df: pd.DataFrame, period: int = 20) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3.0
    ma = sma(tp, period)
    md = (tp - ma).abs().rolling(period, min_periods=period).mean()
    return (tp - ma) / (0.015 * md.replace(0.0, np.nan))


def momentum(series: pd.Series, period: int = 10) -> pd.Series:
    return series - series.shift(period)


# --------------------------------------------------------------------------
# Trend strength
# --------------------------------------------------------------------------


def adx(df: pd.DataFrame, period: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=df.index)
    atr_ = rma(true_range(df), period).replace(0.0, np.nan)
    plus_di = 100.0 * rma(plus_dm, period) / atr_
    minus_di = 100.0 * rma(minus_dm, period) / atr_
    dx = 100.0 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0.0, np.nan)
    return rma(dx, period), plus_di, minus_di


def efficiency_ratio(series: pd.Series, period: int = 20) -> pd.Series:
    """Kaufman's ER: net move over summed movement. 1.0 = clean trend, ~0 = chop."""
    direction = (series - series.shift(period)).abs()
    volatility = series.diff().abs().rolling(period, min_periods=period).sum()
    return direction / volatility.replace(0.0, np.nan)


def slope(series: pd.Series, period: int = 20) -> pd.Series:
    """Least-squares slope per bar, in price units."""
    x = np.arange(period, dtype=float)
    x_centered = x - x.mean()
    denom = float((x_centered**2).sum())

    def _fit(window: np.ndarray) -> float:
        return float(np.dot(x_centered, window - window.mean()) / denom)

    return series.rolling(period, min_periods=period).apply(_fit, raw=True)


def supertrend(
    df: pd.DataFrame, period: int = 10, mult: float = 3.0
) -> tuple[pd.Series, pd.Series]:
    """Returns (trend_line, direction) where direction is +1 up / -1 down.

    Written as an explicit loop because each band depends on the previous
    band — the standard vectorised shortcuts get this subtly wrong.
    """
    hl2 = (df["high"] + df["low"]) / 2.0
    band = atr(df, period) * mult
    upper_basic = (hl2 + band).to_numpy()
    lower_basic = (hl2 - band).to_numpy()
    close = df["close"].to_numpy()

    n = len(df)
    upper = np.full(n, np.nan)
    lower = np.full(n, np.nan)
    direction = np.full(n, np.nan)
    line = np.full(n, np.nan)

    for i in range(n):
        if np.isnan(upper_basic[i]):
            continue
        if i == 0 or np.isnan(upper[i - 1]):
            upper[i], lower[i] = upper_basic[i], lower_basic[i]
            direction[i] = 1.0 if close[i] >= lower_basic[i] else -1.0
        else:
            upper[i] = (
                min(upper_basic[i], upper[i - 1])
                if close[i - 1] <= upper[i - 1]
                else upper_basic[i]
            )
            lower[i] = (
                max(lower_basic[i], lower[i - 1])
                if close[i - 1] >= lower[i - 1]
                else lower_basic[i]
            )
            if close[i] > upper[i - 1]:
                direction[i] = 1.0
            elif close[i] < lower[i - 1]:
                direction[i] = -1.0
            else:
                direction[i] = direction[i - 1]
        line[i] = lower[i] if direction[i] > 0 else upper[i]

    return pd.Series(line, index=df.index), pd.Series(direction, index=df.index)


# --------------------------------------------------------------------------
# Structure
# --------------------------------------------------------------------------


def swing_high(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.Series:
    """Confirmed swing highs, carried forward.

    A pivot at bar i is only *known* at bar i+right, so the result is shifted
    by `right`. Skipping that shift is the classic look-ahead bug in SMC code.
    """
    highs = df["high"]
    window = left + right + 1
    is_pivot = highs.rolling(window, min_periods=window).apply(
        lambda w: float(np.argmax(w) == left), raw=True
    )
    pivot_value = highs.shift(right).where(is_pivot.shift(0) == 1.0)
    return pivot_value.ffill()


def swing_low(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.Series:
    lows = df["low"]
    window = left + right + 1
    is_pivot = lows.rolling(window, min_periods=window).apply(
        lambda w: float(np.argmin(w) == left), raw=True
    )
    pivot_value = lows.shift(right).where(is_pivot.shift(0) == 1.0)
    return pivot_value.ffill()


def fractal_levels(
    df: pd.DataFrame, left: int = 2, right: int = 2
) -> tuple[pd.Series, pd.Series]:
    return swing_high(df, left, right), swing_low(df, left, right)


def zscore(series: pd.Series, period: int = 20) -> pd.Series:
    mean = series.rolling(period, min_periods=period).mean()
    sd = series.rolling(period, min_periods=period).std(ddof=0)
    return (series - mean) / sd.replace(0.0, np.nan)


def percent_rank(series: pd.Series, period: int = 100) -> pd.Series:
    """Where the latest value sits inside its own trailing distribution, 0..1."""
    return series.rolling(period, min_periods=period).apply(
        lambda w: float((w[:-1] <= w[-1]).mean()), raw=True
    )


def session_vwap(df: pd.DataFrame, session_key: pd.Series) -> pd.Series:
    """VWAP anchored to each session (or day). Falls back to typical price when
    the feed carries no volume, which is common for spot gold."""
    tp = (df["high"] + df["low"] + df["close"]) / 3.0
    vol = df["volume"].replace(0.0, np.nan).fillna(1.0)
    pv = (tp * vol).groupby(session_key).cumsum()
    cum_vol = vol.groupby(session_key).cumsum()
    return pv / cum_vol


def anchored_range(
    df: pd.DataFrame, key: pd.Series
) -> tuple[pd.Series, pd.Series]:
    """Running high/low within each group — the box for range-breakout logic."""
    return df["high"].groupby(key).cummax(), df["low"].groupby(key).cummin()
