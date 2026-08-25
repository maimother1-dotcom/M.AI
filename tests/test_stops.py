"""Stop placement, break-even, scaling out and the trail."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from goldbot.core.features import MarketView, build_features
from goldbot.core.types import Direction, ExitReason, Position, Side
from goldbot.data.synthetic import generate
from goldbot.risk import stops as stop_rules


@pytest.fixture(scope="module")
def view() -> MarketView:
    df = generate(bars=1200, seed=5)
    features = build_features(df)
    return MarketView(df, features, len(df) - 1)


def make_position(side: Side, entry: float, stop: float, lots: float = 0.10) -> Position:
    return Position(
        ticket=1,
        side=side,
        entry_price=entry,
        lots=lots,
        stop_loss=stop,
        take_profit=None,
        opened_at=datetime(2026, 1, 5, 12, tzinfo=timezone.utc),
        initial_lots=lots,
        initial_stop=stop,
    )


def test_initial_stop_sits_below_a_long_and_above_a_short(view):
    cfg = stop_rules.StopConfig()
    entry = view.close
    long_stop = stop_rules.initial_stop(view, Direction.LONG, entry, cfg)
    short_stop = stop_rules.initial_stop(view, Direction.SHORT, entry, cfg)
    assert long_stop < entry < short_stop


def test_stop_distance_is_clamped_to_the_atr_band(view):
    cfg = stop_rules.StopConfig(atr_mult=1.8, min_atr_mult=1.0, max_atr_mult=3.5)
    atr = view.f("atr")
    entry = view.close
    # A structure hint miles away must not produce an unaffordable stop.
    stop = stop_rules.initial_stop(view, Direction.LONG, entry, cfg, structure_hint=entry - 500)
    assert (entry - stop) <= cfg.max_atr_mult * atr + 0.01
    # A hint right next to price must not produce a stop inside the noise.
    stop = stop_rules.initial_stop(view, Direction.LONG, entry, cfg, structure_hint=entry - 0.01)
    assert (entry - stop) >= cfg.min_atr_mult * atr - 0.01


def test_take_profit_respects_the_reward_multiple():
    cfg = stop_rules.StopConfig(take_profit_r=2.5)
    tp = stop_rules.take_profit(2000.0, 1990.0, Direction.LONG, cfg)
    assert tp == pytest.approx(2025.0)
    tp_short = stop_rules.take_profit(2000.0, 2010.0, Direction.SHORT, cfg)
    assert tp_short == pytest.approx(1975.0)


def test_a_nearer_strategy_target_is_used_when_it_still_clears_1_2r():
    cfg = stop_rules.StopConfig(take_profit_r=3.0)
    tp = stop_rules.take_profit(2000.0, 1990.0, Direction.LONG, cfg, target_hint=2018.0)
    assert tp == pytest.approx(2018.0)


def test_a_target_inside_1_2r_is_ignored():
    cfg = stop_rules.StopConfig(take_profit_r=3.0)
    tp = stop_rules.take_profit(2000.0, 1990.0, Direction.LONG, cfg, target_hint=2005.0)
    assert tp == pytest.approx(2030.0)


def test_partial_fires_once_at_one_r(view):
    cfg = stop_rules.StopConfig(partial_at_r=1.0, partial_fraction=0.5)
    position = make_position(Side.BUY, 2000.0, 1990.0)
    _, actions = stop_rules.manage_position(position, view, cfg, price=2010.0)
    assert (ExitReason.PARTIAL_TP, 0.5) in actions

    position.partial_done = True
    _, actions = stop_rules.manage_position(position, view, cfg, price=2011.0)
    assert not any(reason is ExitReason.PARTIAL_TP for reason, _ in actions)


def test_stop_moves_to_break_even_after_one_r(view):
    cfg = stop_rules.StopConfig(breakeven_at_r=1.0, trail_start_r=99.0)
    position = make_position(Side.BUY, 2000.0, 1990.0)
    new_stop, _ = stop_rules.manage_position(position, view, cfg, price=2010.0)
    assert new_stop is not None and new_stop >= 2000.0


def test_stop_is_never_loosened(view):
    cfg = stop_rules.StopConfig()
    position = make_position(Side.BUY, 2000.0, 1990.0)
    position.stop_loss = 2005.0  # already trailed well past break-even
    new_stop, _ = stop_rules.manage_position(position, view, cfg, price=2010.0)
    assert new_stop is None or new_stop >= 2005.0


def test_time_stop_closes_a_stalled_trade(view):
    cfg = stop_rules.StopConfig(time_stop_bars=10, time_stop_min_r=0.5)
    position = make_position(Side.BUY, 2000.0, 1990.0)
    position.bars_held = 11
    _, actions = stop_rules.manage_position(position, view, cfg, price=2001.0)
    assert (ExitReason.TIME_STOP, 1.0) in actions


def test_a_winning_trade_is_not_time_stopped(view):
    cfg = stop_rules.StopConfig(time_stop_bars=10, time_stop_min_r=0.5)
    position = make_position(Side.BUY, 2000.0, 1990.0)
    position.bars_held = 11
    _, actions = stop_rules.manage_position(position, view, cfg, price=2009.0)
    assert not any(reason is ExitReason.TIME_STOP for reason, _ in actions)
