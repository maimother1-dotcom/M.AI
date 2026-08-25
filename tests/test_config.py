"""Configuration loading, validation and secret handling."""

from __future__ import annotations

import pytest

from goldbot import config as config_module
from goldbot.config import BotConfig, expand, load


def test_defaults_are_internally_consistent():
    assert BotConfig().validate() == []


def test_risk_limits_must_be_ordered():
    cfg = BotConfig()
    cfg.risk.risk_per_trade = 0.05
    cfg.risk.max_daily_loss = 0.02
    problems = cfg.validate()
    assert any("max_daily_loss" in p for p in problems)


def test_absurd_risk_is_rejected():
    cfg = BotConfig()
    cfg.risk.risk_per_trade = 0.25
    assert any("risk_per_trade" in p for p in cfg.validate())


def test_live_requires_an_explicit_confirmation():
    cfg = BotConfig()
    cfg.runtime.dry_run = False
    cfg.broker = "oanda"
    cfg.oanda.token = "x"
    cfg.oanda.account_id = "y"
    assert any("confirm_live" in p for p in cfg.validate())


def test_unknown_strategy_weights_are_caught():
    cfg = BotConfig()
    cfg.strategies.weights["not_a_strategy"] = 1.0
    assert any("unknown strategies" in p for p in cfg.validate())


def test_env_expansion(monkeypatch):
    monkeypatch.setenv("GOLDBOT_TEST_TOKEN", "secret-value")
    assert expand("${GOLDBOT_TEST_TOKEN}") == "secret-value"
    assert expand({"a": ["${GOLDBOT_TEST_TOKEN}"]}) == {"a": ["secret-value"]}
    assert expand("${GOLDBOT_MISSING_VAR}") is None


def test_secrets_are_never_written_back(tmp_path):
    cfg = BotConfig()
    cfg.oanda.token = "super-secret"
    cfg.mt5.password = "hunter2"
    path = cfg.save(tmp_path / "out.yaml")
    text = path.read_text()
    assert "super-secret" not in text
    assert "hunter2" not in text
    assert "${OANDA_TOKEN}" in text


def test_packaged_config_loads_and_validates():
    cfg = load(config_module.DEFAULT_CONFIG_PATH)
    assert cfg.symbol == "XAUUSD"
    assert cfg.validate() == []
    assert len(cfg.strategies.weights) == 17


def test_unknown_settings_are_rejected(tmp_path):
    path = tmp_path / "bad.yaml"
    path.write_text("risk:\n  not_a_setting: 1\n")
    with pytest.raises(ValueError, match="unknown settings"):
        load(path)


def test_session_policy_is_built_from_config():
    cfg = BotConfig()
    cfg.news_events = ["2026-09-17T18:00:00+00:00"]
    policy = cfg.session_policy()
    assert policy.allowed_sessions == ("london", "new_york")
    assert policy.calendar is not None and len(policy.calendar.events) == 1
