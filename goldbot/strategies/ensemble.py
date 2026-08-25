"""The ensemble: turns thirteen opinions into one decision.

No single strategy is trusted. A trade needs (a) genuine agreement among the
strategies that spoke, (b) enough of the committee speaking at all, and
(c) that agreement to survive the regime filter. Weights adapt to realised
performance, so a strategy that stops working is demoted automatically
instead of waiting for a human to notice.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from ..core.features import MarketView
from ..core.types import Direction, Regime, StrategySignal
from .base import Strategy


@dataclass
class EnsembleConfig:
    #: Minimum blended confidence to open a trade.
    entry_threshold: float = 0.34
    #: Consensus among the strategies that actually voted, 0..1.
    min_agreement: float = 0.60
    #: How many aligned voters are required.
    min_voters: int = 2
    #: How many distinct strategy families must agree (trend/mean_rev/...).
    min_families: int = 1
    #: Participation that counts as "full committee"; below it, confidence scales down.
    target_participation: float = 0.35
    #: Extra confidence demanded when trading against the blended trend bias.
    counter_trend_penalty: float = 0.10
    #: Confidence multiplier per regime, applied last.
    regime_scale: dict[str, float] = field(
        default_factory=lambda: {
            Regime.STRONG_TREND.value: 1.05,
            Regime.WEAK_TREND.value: 1.0,
            Regime.RANGE.value: 0.95,
            Regime.VOLATILE_CHOP.value: 0.75,
        }
    )
    #: Bonus for agreement across different strategy families.
    diversity_bonus: float = 0.06
    #: Adaptive weighting bounds.
    adaptive_enabled: bool = True
    adaptive_min: float = 0.35
    adaptive_max: float = 1.75
    adaptive_half_life: int = 40


@dataclass
class EnsembleDecision:
    direction: Direction
    confidence: float
    raw_score: float
    agreement: float
    participation: float
    regime: Regime
    contributors: dict[str, float] = field(default_factory=dict)
    signals: list[StrategySignal] = field(default_factory=list)
    stop_hint: Optional[float] = None
    target_hint: Optional[float] = None
    reason: str = ""
    rejected: str = ""

    @property
    def actionable(self) -> bool:
        return self.direction is not Direction.FLAT and not self.rejected

    def describe(self) -> str:
        top = sorted(self.contributors.items(), key=lambda kv: -abs(kv[1]))[:4]
        parts = ", ".join(f"{name} {value:+.2f}" for name, value in top)
        return (
            f"{self.direction.name} conf={self.confidence:.2f} "
            f"agree={self.agreement:.2f} part={self.participation:.2f} "
            f"[{self.regime.value}] {parts}"
        )


class AdaptiveWeights:
    """Exponentially-weighted realised performance per strategy.

    Each closed trade credits its contributors in proportion to how much they
    pushed the decision, so a strategy that consistently backs winners earns a
    larger say and one that backs losers is quietly turned down.
    """

    def __init__(self, half_life: int = 40, lo: float = 0.35, hi: float = 1.75):
        self.half_life = max(1, half_life)
        self.lo = lo
        self.hi = hi
        self.decay = 0.5 ** (1.0 / self.half_life)
        self.score: dict[str, float] = {}
        self.weight_sum: dict[str, float] = {}
        self.trades: dict[str, float] = {}

    def multiplier(self, name: str) -> float:
        weight = self.weight_sum.get(name, 0.0)
        if weight < 1.0:
            return 1.0  # not enough evidence yet
        expectancy = self.score.get(name, 0.0) / weight
        # Map expectancy in R to a multiplier around 1.0; ±1R saturates.
        multiplier = 1.0 + 0.6 * max(-1.0, min(1.0, expectancy))
        return float(min(self.hi, max(self.lo, multiplier)))

    def update(self, contributors: dict[str, float], r_multiple: float) -> None:
        for name in set(list(self.score) + list(contributors)):
            self.score[name] = self.score.get(name, 0.0) * self.decay
            self.weight_sum[name] = self.weight_sum.get(name, 0.0) * self.decay
        for name, share in contributors.items():
            weight = abs(share)
            if weight <= 0:
                continue
            self.score[name] += weight * r_multiple
            self.weight_sum[name] += weight
            self.trades[name] = self.trades.get(name, 0.0) + 1.0

    def snapshot(self) -> dict[str, dict[str, float]]:
        return {
            name: {
                "expectancy_r": round(
                    self.score.get(name, 0.0) / self.weight_sum[name], 3
                )
                if self.weight_sum.get(name, 0.0) >= 1.0
                else 0.0,
                "multiplier": round(self.multiplier(name), 3),
                "trades": self.trades.get(name, 0.0),
            }
            for name in sorted(self.weight_sum)
        }

    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(
            json.dumps(
                {
                    "half_life": self.half_life,
                    "score": self.score,
                    "weight_sum": self.weight_sum,
                    "trades": self.trades,
                },
                indent=2,
            )
        )

    def load(self, path: str | Path) -> None:
        file = Path(path)
        if not file.exists():
            return
        data = json.loads(file.read_text())
        self.half_life = data.get("half_life", self.half_life)
        self.decay = 0.5 ** (1.0 / max(1, self.half_life))
        self.score = {k: float(v) for k, v in data.get("score", {}).items()}
        self.weight_sum = {k: float(v) for k, v in data.get("weight_sum", {}).items()}
        self.trades = {k: float(v) for k, v in data.get("trades", {}).items()}


class Ensemble:
    def __init__(
        self,
        strategies: Iterable[Strategy],
        weights: Optional[dict[str, float]] = None,
        config: Optional[EnsembleConfig] = None,
    ) -> None:
        self.strategies = list(strategies)
        self.config = config or EnsembleConfig()
        self.weights = {s.name: float((weights or {}).get(s.name, 1.0)) for s in self.strategies}
        self.adaptive = AdaptiveWeights(
            half_life=self.config.adaptive_half_life,
            lo=self.config.adaptive_min,
            hi=self.config.adaptive_max,
        )
        self.last_signals: list[StrategySignal] = []

    # -- weighting --------------------------------------------------------
    def effective_weight(self, strategy: Strategy, regime: Regime) -> float:
        weight = self.weights.get(strategy.name, 1.0) * strategy.affinity(regime)
        if self.config.adaptive_enabled:
            weight *= self.adaptive.multiplier(strategy.name)
        return max(0.0, weight)

    def on_trade_closed(self, contributors: dict[str, float], r_multiple: float) -> None:
        if self.config.adaptive_enabled:
            self.adaptive.update(contributors, r_multiple)

    # -- the decision -----------------------------------------------------
    def evaluate(self, view: MarketView) -> EnsembleDecision:
        cfg = self.config
        regime = view.regime
        signals: list[StrategySignal] = []
        weighted: dict[str, float] = {}
        total_weight = 0.0
        raw = 0.0
        gross = 0.0

        for strategy in self.strategies:
            weight = self.effective_weight(strategy, regime)
            total_weight += weight
            if view.i < strategy.warmup or weight <= 0.0:
                continue
            try:
                signal = strategy.generate(view)
            except Exception as exc:  # a broken strategy must not stop the bot
                signal = StrategySignal(
                    name=strategy.name, direction=Direction.FLAT, reason=f"error:{exc}"
                )
            signals.append(signal)
            if signal.direction is Direction.FLAT:
                continue
            contribution = weight * signal.score
            weighted[strategy.name] = contribution
            raw += contribution
            gross += abs(contribution)

        self.last_signals = signals
        if total_weight <= 0 or gross <= 0:
            # Nobody spoke. Still carry the signals so the caller can show why.
            return EnsembleDecision(
                Direction.FLAT,
                0.0,
                0.0,
                0.0,
                0.0,
                regime,
                signals=signals,
                rejected="no_votes",
            )

        direction = Direction.LONG if raw > 0 else Direction.SHORT
        agreement = abs(raw) / gross
        participation = gross / total_weight
        aligned = {
            name: value
            for name, value in weighted.items()
            if value * direction.value > 0
        }
        families = {
            s.kind for s in self.strategies if s.name in aligned
        }

        confidence = agreement * min(1.0, participation / max(cfg.target_participation, 1e-9))
        if len(families) > 1:
            confidence += cfg.diversity_bonus * (len(families) - 1)

        bias = view.f("trend_bias")
        counter_trend = False
        if bias == bias and abs(bias) > 0.3 and bias * direction.value < 0:
            counter_trend = True
            confidence -= cfg.counter_trend_penalty

        confidence *= cfg.regime_scale.get(regime.value, 1.0)
        confidence = float(max(0.0, min(1.0, confidence)))

        stop_hint = self._pick_stop(aligned, signals, direction)
        target_hint = self._pick_target(aligned, signals, direction)

        decision = EnsembleDecision(
            direction=direction,
            confidence=confidence,
            raw_score=raw / total_weight,
            agreement=agreement,
            participation=participation,
            regime=regime,
            contributors={k: round(v, 4) for k, v in weighted.items()},
            signals=signals,
            stop_hint=stop_hint,
            target_hint=target_hint,
            reason="; ".join(
                s.reason for s in signals if s.name in aligned and s.reason
            )[:400],
        )

        if len(aligned) < cfg.min_voters:
            decision.rejected = f"only {len(aligned)} aligned voters"
        elif len(families) < cfg.min_families:
            decision.rejected = "insufficient family diversity"
        elif agreement < cfg.min_agreement:
            decision.rejected = f"agreement {agreement:.2f} < {cfg.min_agreement}"
        elif confidence < cfg.entry_threshold:
            decision.rejected = f"confidence {confidence:.2f} < {cfg.entry_threshold}"
        elif counter_trend and confidence < cfg.entry_threshold + cfg.counter_trend_penalty:
            decision.rejected = "counter-trend without conviction"

        return decision

    # -- stop / target selection -----------------------------------------
    @staticmethod
    def _pick_stop(
        aligned: dict[str, float],
        signals: list[StrategySignal],
        direction: Direction,
    ) -> Optional[float]:
        """Widest stop among the aligned voters — the trade must survive every
        idea that justified it, not just the tightest one."""
        hints = [
            s.stop_hint
            for s in signals
            if s.name in aligned and s.stop_hint is not None and math.isfinite(s.stop_hint)
        ]
        if not hints:
            return None
        return min(hints) if direction is Direction.LONG else max(hints)

    @staticmethod
    def _pick_target(
        aligned: dict[str, float],
        signals: list[StrategySignal],
        direction: Direction,
    ) -> Optional[float]:
        """Nearest target among aligned voters — the first objective anyone in
        the committee expects price to reach."""
        hints = [
            s.target_hint
            for s in signals
            if s.name in aligned and s.target_hint is not None and math.isfinite(s.target_hint)
        ]
        if not hints:
            return None
        return min(hints) if direction is Direction.LONG else max(hints)
