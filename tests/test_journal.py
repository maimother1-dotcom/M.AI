"""Journal writing and strategy attribution."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from goldbot.core.types import ExitReason, Side, Trade
from goldbot.journal import Journal


def make_trade(pnl: float, contributors: dict[str, float]) -> Trade:
    return Trade(
        ticket=1,
        side=Side.BUY,
        lots=0.1,
        entry_price=2000.0,
        exit_price=2010.0,
        opened_at=datetime(2026, 1, 5, 10, tzinfo=timezone.utc),
        closed_at=datetime(2026, 1, 5, 12, tzinfo=timezone.utc),
        pnl=pnl,
        r_multiple=pnl / 50.0,
        exit_reason=ExitReason.TAKE_PROFIT,
        initial_stop=1990.0,
        contributors=contributors,
    )


def test_journal_is_append_only(tmp_path):
    journal = Journal(tmp_path / "j.jsonl")
    journal.write("a", value=1)
    journal.write("b", value=2)
    frame = journal.read()
    assert list(frame["event"]) == ["a", "b"]


def test_reading_filters_by_event(tmp_path):
    journal = Journal(tmp_path / "j.jsonl")
    journal.exit(make_trade(100.0, {"turtle": 1.0}))
    journal.write("decision", direction="FLAT")
    assert len(journal.read("exit")) == 1


def test_a_corrupt_line_does_not_break_reading(tmp_path):
    path = tmp_path / "j.jsonl"
    journal = Journal(path)
    journal.write("a", value=1)
    with path.open("a") as handle:
        handle.write("{not json\n")
    journal.write("b", value=2)
    assert len(journal.read()) == 2


def test_attribution_splits_pnl_by_vote_weight(tmp_path):
    journal = Journal(tmp_path / "j.jsonl")
    journal.exit(make_trade(100.0, {"turtle": 3.0, "squeeze": 1.0}))
    attribution = journal.strategy_attribution()
    assert attribution.loc["turtle", "pnl"] == pytest.approx(75.0)
    assert attribution.loc["squeeze", "pnl"] == pytest.approx(25.0)


def test_equity_file_gets_a_header(tmp_path):
    journal = Journal(tmp_path / "j.jsonl", tmp_path / "e.csv")
    journal.equity(10_000.0, 10_050.0, 1)
    lines = (tmp_path / "e.csv").read_text().splitlines()
    assert lines[0] == "time,balance,equity,open_positions"
    assert lines[1].endswith("10000.00,10050.00,1")
