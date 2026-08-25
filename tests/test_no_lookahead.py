"""The property the whole backtest rests on: no feature may use future bars.

If any indicator peeked ahead, computing the features on a truncated history
would give a different value for the final bar than computing them on the full
history. That is exactly what this checks, column by column.
"""

from __future__ import annotations

import numpy as np
import pytest

from goldbot.core.features import build_features
from goldbot.data.synthetic import generate
from goldbot.strategies import build_strategies
from goldbot.core.features import MarketView


@pytest.fixture(scope="module")
def data():
    return generate(bars=2500, seed=11)


@pytest.fixture(scope="module")
def full_features(data):
    return build_features(data)


@pytest.mark.parametrize("cut", [1400, 1800, 2100])
def test_features_do_not_change_when_the_future_is_removed(data, full_features, cut):
    truncated = build_features(data.iloc[:cut])
    last = truncated.index[-1]
    for column in truncated.columns:
        if column in {"regime"}:
            assert truncated[column].iloc[-1] == full_features.loc[last, column]
            continue
        a = truncated[column].iloc[-1]
        b = full_features.loc[last, column]
        if isinstance(a, (bool, np.bool_)):
            assert bool(a) == bool(b), column
            continue
        if a != a and b != b:  # both NaN
            continue
        assert a == pytest.approx(b, rel=1e-9, abs=1e-9), column


@pytest.mark.parametrize("cut", [1600, 2000])
def test_strategy_signals_are_identical_on_truncated_history(data, cut):
    truncated = data.iloc[:cut]
    truncated_features = build_features(truncated)
    full_features = build_features(data)

    strategies = build_strategies()
    view_truncated = MarketView(truncated, truncated_features, cut - 1)
    view_full = MarketView(data, full_features, cut - 1)

    for strategy in strategies:
        a = strategy.generate(view_truncated)
        b = strategy.generate(view_full)
        assert a.direction is b.direction, strategy.name
        assert a.confidence == pytest.approx(b.confidence, abs=1e-9), strategy.name
