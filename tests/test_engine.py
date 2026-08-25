"""Live-engine integration, driven by a replayed history.

This exercises the same code path that trades real money — engine loop, broker
calls, journal, state persistence — without a broker connection.
"""

from __future__ import annotations

import pytest

from goldbot.config import BotConfig
from goldbot.core.types import ExitReason
from goldbot.data.replay import ReplayFeed
from goldbot.data.synthetic import generate
from goldbot.execution.broker import PaperBroker
from goldbot.execution.engine import TradingEngine
from goldbot.factory import build_ensemble, build_risk
from goldbot.journal import Journal
from goldbot.notify import Notifier


@pytest.fixture(scope="module")
def history():
    return generate(bars=2200, seed=29)


def make_engine(tmp_path, history, **overrides) -> TradingEngine:
    cfg = BotConfig()
    cfg.runtime.state_dir = str(tmp_path)
    cfg.runtime.poll_seconds = 0
    cfg.runtime.dry_run = True
    cfg.runtime.log_file = None
    cfg.data.live_bars = 1400
    for key, value in overrides.items():
        setattr(cfg.runtime, key, value)

    feed = ReplayFeed(history, timeframe=cfg.timeframe, start_at=1400)
    broker = PaperBroker(balance=cfg.initial_balance, spread=cfg.costs.base_spread)
    return TradingEngine(
        cfg,
        feed,
        broker,
        build_ensemble(cfg),
        build_risk(cfg),
        Journal(tmp_path / "j.jsonl", tmp_path / "e.csv"),
        Notifier(None),
    )


@pytest.fixture(scope="module")
def finished(tmp_path_factory, history):
    tmp_path = tmp_path_factory.mktemp("engine")
    engine = make_engine(tmp_path, history)
    engine.run()
    return engine, tmp_path


def test_the_engine_processes_every_replayed_bar(finished):
    engine, _ = finished
    assert engine._run_bars > 500


def test_decisions_are_journalled(finished):
    engine, tmp_path = finished
    decisions = engine.journal.read("decision")
    assert len(decisions) > 100
    assert set(decisions["direction"]) <= {"LONG", "SHORT", "FLAT"}


def test_every_position_was_opened_with_a_stop(finished):
    engine, _ = finished
    entries = engine.journal.read("entry")
    if entries.empty:
        pytest.skip("no entries in this replay window")
    assert (entries["stop"].astype(float) > 0).all()
    for _, row in entries.iterrows():
        if row["side"] == "BUY":
            assert row["stop"] < row["entry"]
        else:
            assert row["stop"] > row["entry"]


def test_realised_pnl_matches_the_broker_balance(finished):
    engine, _ = finished
    trades = engine.broker.closed_trades
    if not trades:
        pytest.skip("no closed trades in this replay window")
    expected = 10_000 + sum(t.pnl for t in trades)
    open_lots = sum(p.lots for p in engine.broker.positions())
    if open_lots == 0:
        assert engine.broker.account().balance == pytest.approx(expected, abs=1.0)


def test_exits_carry_a_reason(finished):
    engine, _ = finished
    trades = engine.broker.closed_trades
    if not trades:
        pytest.skip("no closed trades")
    valid = {r.value for r in ExitReason}
    assert all(t.exit_reason.value in valid for t in trades)


def test_state_survives_a_restart(finished, history, tmp_path_factory):
    engine, tmp_path = finished
    engine._persist()
    assert (tmp_path / "engine_state.json").exists()

    resumed = make_engine(tmp_path, history)
    assert resumed.state.last_bar == engine.state.last_bar
    assert resumed.state.cycles == 0  # per-run counter resets


def test_max_cycles_stops_the_loop(tmp_path, history):
    engine = make_engine(tmp_path, history, max_cycles=5)
    engine.run()
    assert engine.state.cycles == 5


def test_dry_run_always_uses_the_paper_broker(tmp_path):
    from goldbot.factory import build_broker

    cfg = BotConfig()
    cfg.broker = "mt5"          # would be a real terminal…
    cfg.runtime.dry_run = True  # …but dry_run overrides it
    cfg.runtime.state_dir = str(tmp_path)
    assert isinstance(build_broker(cfg), PaperBroker)
