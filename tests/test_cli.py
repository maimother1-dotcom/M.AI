"""Smoke tests for the command line — every command must at least run."""

from __future__ import annotations

import pytest

from goldbot.cli import main


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    """Keep tests out of the real ~/.goldbot."""
    config = tmp_path / "cfg.yaml"
    assert main(["init", "--out", str(config)]) == 0
    text = config.read_text().replace("state_dir: ~/.goldbot", f"state_dir: {tmp_path}")
    config.write_text(text)
    monkeypatch.setenv("GOLDBOT_TEST_CONFIG", str(config))
    return config


def test_init_writes_a_loadable_config(isolated_state):
    from goldbot.config import load

    cfg = load(isolated_state)
    assert cfg.validate() == []


def test_doctor_passes_on_the_defaults(isolated_state, capsys):
    code = main(["--config", str(isolated_state), "doctor"])
    output = capsys.readouterr().out
    assert code == 0
    assert "validation: OK" in output
    assert "feed OK" in output


def test_backtest_runs_and_reports(isolated_state, capsys):
    code = main(["--config", str(isolated_state), "backtest", "--bars", "2500", "--seed", "42"])
    output = capsys.readouterr().out
    assert code == 0
    assert "Net profit" in output
    assert "Max drawdown" in output
    assert "Synthetic data" in output  # the honesty warning must be printed


def test_backtest_writes_its_artefacts(isolated_state, tmp_path, capsys):
    out = tmp_path / "results"
    code = main(
        ["--config", str(isolated_state), "backtest", "--bars", "2500", "--seed", "42", "--out", str(out)]
    )
    capsys.readouterr()
    assert code == 0
    assert (out / "metrics.json").exists()
    assert (out / "equity.csv").exists()
    assert (out / "trades.csv").exists()


def test_signals_explains_the_current_view(isolated_state, capsys):
    code = main(["--config", str(isolated_state), "signals", "--bars", "1500", "--seed", "42"])
    output = capsys.readouterr().out
    assert code == 0
    assert "votes:" in output
    assert "ensemble" in output


def test_status_is_graceful_with_an_empty_journal(isolated_state, capsys):
    code = main(["--config", str(isolated_state), "status"])
    assert code == 0
    assert "no closed trades" in capsys.readouterr().out


def test_data_export(isolated_state, tmp_path, capsys):
    target = tmp_path / "x.csv"
    code = main(["--config", str(isolated_state), "data", "--bars", "800", "--out", str(target)])
    capsys.readouterr()
    assert code == 0 and target.exists()


def test_live_refuses_without_the_safety_switches(isolated_state, capsys):
    code = main(["--config", str(isolated_state), "live", "--yes"])
    output = capsys.readouterr().out
    assert code == 2
    assert "refusing to trade live" in output or "broker is 'paper'" in output
