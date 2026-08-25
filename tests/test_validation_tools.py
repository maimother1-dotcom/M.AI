"""The tools that are supposed to catch over-fitting must themselves work."""

from __future__ import annotations

import numpy as np
import pytest

from goldbot.backtest.metrics import Metrics
from goldbot.backtest.walkforward import (
    Candidate,
    default_candidate,
    monte_carlo,
    sample_candidate,
    score_metrics,
    walk_forward,
)
from goldbot.core.types import ExitReason, Side, Trade
from goldbot.data.synthetic import generate

import random
from datetime import datetime, timedelta, timezone


def make_trades(r_values: list[float]) -> list[Trade]:
    start = datetime(2026, 1, 5, 10, tzinfo=timezone.utc)
    return [
        Trade(
            ticket=i,
            side=Side.BUY,
            lots=0.1,
            entry_price=2000.0,
            exit_price=2000.0 + r * 10,
            opened_at=start + timedelta(hours=i),
            closed_at=start + timedelta(hours=i + 1),
            pnl=r * 50.0,
            r_multiple=r,
            exit_reason=ExitReason.TAKE_PROFIT if r > 0 else ExitReason.STOP_LOSS,
            initial_stop=1990.0,
        )
        for i, r in enumerate(r_values)
    ]


def test_monte_carlo_spreads_outcomes():
    """Resampling must produce a distribution, not one repeated number."""
    trades = make_trades([2.0, -1.0, -1.0, 1.5, -1.0, 3.0, -1.0, 0.5] * 12)
    result = monte_carlo(trades, 10_000, runs=500, risk_per_trade=0.01)
    assert result["p05_final"] < result["median_final"] < result["p95_final"]
    assert 0.0 <= result["prob_profit"] <= 1.0
    assert result["p95_max_dd_pct"] >= result["median_max_dd_pct"]


def test_monte_carlo_sees_ruin_in_a_losing_system():
    trades = make_trades([-1.0] * 40 + [1.0] * 10)
    result = monte_carlo(trades, 10_000, runs=300, risk_per_trade=0.05)
    assert result["prob_profit"] < 0.2
    assert result["prob_50pct_loss"] > 0.5


def test_monte_carlo_on_no_trades_is_empty():
    assert monte_carlo([], 10_000) == {}


def test_score_penalises_a_thin_sample():
    thin = Metrics(trades=8, cagr=200.0, max_drawdown_pct=5.0, sharpe=4.0, profit_factor=3.0)
    solid = Metrics(trades=150, cagr=30.0, max_drawdown_pct=8.0, sharpe=1.4, profit_factor=1.5)
    assert score_metrics(thin) < score_metrics(solid)


def test_score_prefers_lower_drawdown_at_equal_return():
    calm = Metrics(trades=120, cagr=40.0, max_drawdown_pct=8.0, sharpe=1.5, profit_factor=1.6)
    wild = Metrics(trades=120, cagr=40.0, max_drawdown_pct=30.0, sharpe=1.5, profit_factor=1.6)
    assert score_metrics(calm) > score_metrics(wild)


def test_sampled_candidates_stay_inside_sane_bounds():
    rng = random.Random(0)
    base = default_candidate()
    for _ in range(50):
        candidate = sample_candidate(rng, base)
        assert 0.25 <= candidate.entry_threshold <= 0.55
        assert 0.5 <= candidate.min_agreement <= 0.85
        assert candidate.min_voters >= 2
        assert 0.0025 <= candidate.risk_per_trade <= 0.0075
        assert all(weight >= 0 for weight in candidate.weights.values())


def test_default_candidate_matches_the_shipped_weights():
    candidate = default_candidate()
    assert len(candidate.weights) == 17
    assert isinstance(candidate, Candidate)


@pytest.mark.slow
def test_walk_forward_produces_out_of_sample_folds():
    df = generate(bars=6000, seed=19)
    report = walk_forward(df, folds=2, train_fraction=0.6, iterations=1, seed=1, verbose=False)
    assert len(report.folds) >= 1
    for fold in report.folds:
        assert fold.test_start > fold.train_start
        assert fold.out_of_sample.trades >= 0
    assert np.isfinite(report.efficiency)
