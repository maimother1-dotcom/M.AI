"""Strategy contract.

A strategy is a pure function of a MarketView: same bar in, same signal out,
no I/O, no memory of orders, no knowledge of account size. Position sizing,
stop placement and whether the trade is taken at all belong to the risk layer.
That separation is what lets thirteen strategies vote without any of them
fighting over the account.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from ..core.features import MarketView
from ..core.types import Direction, Regime, StrategySignal

FLAT = Direction.FLAT


class Strategy(ABC):
    #: Unique key. Used in config, weights, journal attribution.
    name: str = "unnamed"
    #: Family, for reporting and for the ensemble's diversity requirement.
    kind: str = "generic"
    #: Bars of history required before the strategy may speak.
    warmup: int = 200
    #: Per-regime multiplier applied to this strategy's ensemble weight.
    regime_affinity: dict[Regime, float] = {
        Regime.STRONG_TREND: 1.0,
        Regime.WEAK_TREND: 1.0,
        Regime.RANGE: 1.0,
        Regime.VOLATILE_CHOP: 0.5,
    }

    def __init__(self, **params) -> None:
        self.params = params
        for key, value in params.items():
            setattr(self, key, value)

    # -- the one method a strategy must implement -------------------------
    @abstractmethod
    def generate(self, view: MarketView) -> StrategySignal:
        ...

    # -- helpers ----------------------------------------------------------
    def flat(self, reason: str = "") -> StrategySignal:
        return StrategySignal(name=self.name, direction=FLAT, reason=reason)

    def signal(
        self,
        direction: Direction,
        confidence: float,
        reason: str,
        stop_hint: Optional[float] = None,
        target_hint: Optional[float] = None,
        **meta,
    ) -> StrategySignal:
        return StrategySignal(
            name=self.name,
            direction=direction,
            confidence=confidence,
            stop_hint=stop_hint,
            target_hint=target_hint,
            reason=reason,
            meta=meta,
        )

    def affinity(self, regime: Regime) -> float:
        return self.regime_affinity.get(regime, 1.0)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<{type(self).__name__} {self.name}>"


TREND_AFFINITY = {
    Regime.STRONG_TREND: 1.35,
    Regime.WEAK_TREND: 1.0,
    Regime.RANGE: 0.35,
    Regime.VOLATILE_CHOP: 0.45,
}

MEANREV_AFFINITY = {
    Regime.STRONG_TREND: 0.25,
    Regime.WEAK_TREND: 0.6,
    Regime.RANGE: 1.35,
    Regime.VOLATILE_CHOP: 0.7,
}

BREAKOUT_AFFINITY = {
    Regime.STRONG_TREND: 1.2,
    Regime.WEAK_TREND: 1.1,
    Regime.RANGE: 0.8,
    Regime.VOLATILE_CHOP: 0.5,
}

STRUCTURE_AFFINITY = {
    Regime.STRONG_TREND: 1.1,
    Regime.WEAK_TREND: 1.15,
    Regime.RANGE: 0.9,
    Regime.VOLATILE_CHOP: 0.6,
}
