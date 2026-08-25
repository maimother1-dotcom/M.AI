"""How votes become a decision."""

from __future__ import annotations

import pytest

from goldbot.core.features import MarketView, build_features
from goldbot.core.types import Direction, Regime, StrategySignal
from goldbot.data.synthetic import generate
from goldbot.strategies.base import Strategy
from goldbot.strategies.ensemble import AdaptiveWeights, Ensemble, EnsembleConfig


class Fixed(Strategy):
    """A strategy that always says the same thing — for testing the maths."""

    warmup = 0

    def __init__(self, name: str, direction: Direction, confidence: float, kind: str = "trend", **kw):
        super().__init__(**kw)
        self.name = name
        self.kind = kind
        self._direction = direction
        self._confidence = confidence

    def generate(self, view: MarketView) -> StrategySignal:
        return StrategySignal(self.name, self._direction, self._confidence, reason="fixed")


class Exploding(Strategy):
    name = "boom"
    warmup = 0

    def generate(self, view: MarketView) -> StrategySignal:
        raise RuntimeError("strategy blew up")


@pytest.fixture(scope="module")
def view() -> MarketView:
    df = generate(bars=900, seed=17)
    return MarketView(df, build_features(df), len(df) - 1)


def test_unanimous_committee_produces_a_trade(view):
    ensemble = Ensemble(
        [
            Fixed("a", Direction.LONG, 0.9),
            Fixed("b", Direction.LONG, 0.9, kind="breakout"),
            Fixed("c", Direction.LONG, 0.9, kind="mean_reversion"),
        ],
        config=EnsembleConfig(counter_trend_penalty=0.0),
    )
    decision = ensemble.evaluate(view)
    assert decision.direction is Direction.LONG
    assert decision.agreement == pytest.approx(1.0)
    assert decision.actionable


def test_a_split_committee_does_not_trade(view):
    ensemble = Ensemble(
        [
            Fixed("a", Direction.LONG, 0.9),
            Fixed("b", Direction.SHORT, 0.9),
        ]
    )
    decision = ensemble.evaluate(view)
    assert not decision.actionable
    assert "agreement" in decision.rejected or "voters" in decision.rejected


def test_a_single_voter_is_not_enough(view):
    ensemble = Ensemble([Fixed("a", Direction.LONG, 1.0)], config=EnsembleConfig(min_voters=2))
    decision = ensemble.evaluate(view)
    assert not decision.actionable
    assert "aligned voters" in decision.rejected


def test_silence_is_reported_as_no_votes(view):
    ensemble = Ensemble([Fixed("a", Direction.FLAT, 0.0), Fixed("b", Direction.FLAT, 0.0)])
    decision = ensemble.evaluate(view)
    assert decision.rejected == "no_votes"
    assert decision.direction is Direction.FLAT


def test_one_broken_strategy_cannot_stop_the_bot(view):
    ensemble = Ensemble(
        [
            Exploding(),
            Fixed("a", Direction.LONG, 0.9),
            Fixed("b", Direction.LONG, 0.9, kind="breakout"),
        ],
        config=EnsembleConfig(counter_trend_penalty=0.0),
    )
    decision = ensemble.evaluate(view)
    assert decision.direction is Direction.LONG
    assert any("error" in s.reason for s in decision.signals)


def test_stop_hint_is_the_widest_of_the_aligned_voters():
    signals = [
        StrategySignal("a", Direction.LONG, 0.9, stop_hint=1990.0),
        StrategySignal("b", Direction.LONG, 0.9, stop_hint=1985.0),
    ]
    picked = Ensemble._pick_stop({"a": 1.0, "b": 1.0}, signals, Direction.LONG)
    assert picked == 1985.0


def test_target_hint_is_the_nearest_of_the_aligned_voters():
    signals = [
        StrategySignal("a", Direction.LONG, 0.9, target_hint=2050.0),
        StrategySignal("b", Direction.LONG, 0.9, target_hint=2020.0),
    ]
    picked = Ensemble._pick_target({"a": 1.0, "b": 1.0}, signals, Direction.LONG)
    assert picked == 2020.0


def test_regime_affinity_changes_the_effective_weight(view):
    strategy = Fixed("a", Direction.LONG, 0.9)
    strategy.regime_affinity = {Regime.RANGE: 0.2, Regime.STRONG_TREND: 1.5}
    ensemble = Ensemble([strategy])
    assert ensemble.effective_weight(strategy, Regime.RANGE) == pytest.approx(0.2)
    assert ensemble.effective_weight(strategy, Regime.STRONG_TREND) == pytest.approx(1.5)


def test_adaptive_weights_demote_a_losing_strategy():
    weights = AdaptiveWeights(half_life=20)
    for _ in range(15):
        weights.update({"loser": 1.0, "winner": 1.0}, r_multiple=0.0)
    for _ in range(15):
        weights.update({"loser": 1.0}, r_multiple=-1.0)
        weights.update({"winner": 1.0}, r_multiple=1.0)
    assert weights.multiplier("loser") < 1.0 < weights.multiplier("winner")
    assert weights.multiplier("loser") >= weights.lo


def test_adaptive_weights_survive_a_round_trip(tmp_path):
    weights = AdaptiveWeights()
    weights.update({"a": 1.0}, 0.8)
    path = tmp_path / "w.json"
    weights.save(path)

    restored = AdaptiveWeights()
    restored.load(path)
    assert restored.multiplier("a") == pytest.approx(weights.multiplier("a"))
