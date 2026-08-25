"""Strategy registry.

Adding a strategy is: write the class, register it here, give it a weight in
config. Nothing else in the bot needs to change.
"""

from __future__ import annotations

from typing import Iterable, Optional

from .base import Strategy
from .breakout import (
    AsianRangeBreakout,
    OpeningRangeBreakout,
    PriorDayBreak,
    SqueezeRelease,
)
from .ensemble import AdaptiveWeights, Ensemble, EnsembleConfig, EnsembleDecision
from .meanrev import BollingerFade, ConnorsRsi2, PivotFade, VwapReversion
from .structure import EngulfingAtLevel, FairValueGap, FibonacciPullback, LiquiditySweep
from .trend import (
    DonchianTurtle,
    EmaStackTrend,
    HtfAlignmentTrend,
    MacdMomentum,
    SupertrendPullback,
)

REGISTRY: dict[str, type[Strategy]] = {
    cls.name: cls
    for cls in (
        EmaStackTrend,
        SupertrendPullback,
        MacdMomentum,
        DonchianTurtle,
        HtfAlignmentTrend,
        ConnorsRsi2,
        BollingerFade,
        VwapReversion,
        PivotFade,
        AsianRangeBreakout,
        OpeningRangeBreakout,
        SqueezeRelease,
        PriorDayBreak,
        LiquiditySweep,
        FairValueGap,
        FibonacciPullback,
        EngulfingAtLevel,
    )
}

#: Default committee weights. Breakout and structure strategies carry slightly
#: more weight because they are the ones with a genuine intraday edge on gold;
#: the oscillators are there to time and to veto, not to lead.
DEFAULT_WEIGHTS: dict[str, float] = {
    "ema_stack": 1.0,
    "supertrend": 1.0,
    "macd_momentum": 0.8,
    "turtle": 1.1,
    "htf_alignment": 0.9,
    "connors_rsi2": 0.9,
    "bollinger_fade": 0.8,
    "vwap_reversion": 0.9,
    "pivot_fade": 0.7,
    "asian_breakout": 1.2,
    "ny_orb": 1.2,
    "squeeze": 1.0,
    "prior_day_break": 0.9,
    "liquidity_sweep": 1.2,
    "fvg_retest": 1.0,
    "fib_pullback": 0.9,
    "engulfing_level": 0.7,
}


def build_strategies(
    names: Optional[Iterable[str]] = None,
    params: Optional[dict[str, dict]] = None,
) -> list[Strategy]:
    params = params or {}
    selected = list(names) if names else list(REGISTRY)
    unknown = [n for n in selected if n not in REGISTRY]
    if unknown:
        raise KeyError(f"unknown strategies: {unknown}")
    return [REGISTRY[name](**params.get(name, {})) for name in selected]


__all__ = [
    "REGISTRY",
    "DEFAULT_WEIGHTS",
    "build_strategies",
    "Strategy",
    "Ensemble",
    "EnsembleConfig",
    "EnsembleDecision",
    "AdaptiveWeights",
]
