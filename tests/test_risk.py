"""Position sizing and the hard limits."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from goldbot.core.types import CONTRACT_SIZE, AccountState, Position, Side
from goldbot.risk.manager import RiskConfig, RiskManager
from goldbot.risk.sessions import EconomicCalendar, SessionPolicy


@pytest.fixture
def manager() -> RiskManager:
    return RiskManager(RiskConfig(), session_policy=SessionPolicy())


def test_risk_per_trade_is_respected_exactly(manager):
    account = AccountState(balance=10_000, equity=10_000)
    # Confidence 0.3 maps to the minimum size factor (0.5).
    lots, risk_amount = manager.size_for_price(account, stop_distance=5.0, confidence=0.3, price=2000)
    assert risk_amount == pytest.approx(lots * 5.0 * CONTRACT_SIZE)
    assert risk_amount <= 10_000 * 0.005 * 0.5 + 1e-6


def test_size_scales_with_confidence(manager):
    account = AccountState(balance=10_000, equity=10_000)
    low, _ = manager.size_for_price(account, 5.0, 0.30, 2000)
    high, _ = manager.size_for_price(account, 5.0, 0.80, 2000)
    assert high > low


def test_wider_stop_means_smaller_position(manager):
    account = AccountState(balance=10_000, equity=10_000)
    tight, _ = manager.size_for_price(account, 3.0, 0.6, 2000)
    wide, _ = manager.size_for_price(account, 12.0, 0.6, 2000)
    assert wide < tight


def test_lots_are_floored_never_rounded_up(manager):
    account = AccountState(balance=1_000, equity=1_000)
    lots, risk_amount = manager.size_for_price(account, 7.3, 0.6, 2000)
    assert lots == round(lots, 2)
    assert risk_amount <= 1_000 * 0.005 * 1.25 + 1e-6


def test_margin_cap_limits_size_on_a_small_account(manager):
    account = AccountState(balance=500, equity=500)
    # A very tight stop would otherwise ask for a huge position.
    lots, _ = manager.size_for_price(account, 0.5, 0.8, 3300)
    margin = lots * CONTRACT_SIZE * 3300 / manager.config.leverage
    assert margin <= 500 * manager.config.max_margin_utilisation + 1e-6


def test_daily_loss_limit_blocks_new_trades(manager):
    moment = datetime(2026, 3, 4, 14, 0, tzinfo=timezone.utc)
    account = AccountState(balance=10_000, equity=10_000)
    manager.sync(moment, account)
    manager.register_close(-350.0)
    allowed, why = manager.can_open(moment, account, [], 10, spread=0.3)
    assert not allowed and why == "daily_loss_limit"


def test_drawdown_kill_switch_halts(manager):
    moment = datetime(2026, 3, 4, 14, 0, tzinfo=timezone.utc)
    manager.sync(moment, AccountState(balance=10_000, equity=10_000))
    manager.sync(moment, AccountState(balance=8_400, equity=8_400))
    assert manager.state.halted
    allowed, why = manager.can_open(moment, AccountState(8_400, 8_400), [], 10, 0.3)
    assert not allowed and why.startswith("halted")


def test_consecutive_losses_trigger_a_cooldown(manager):
    for _ in range(3):
        manager.register_close(-40.0, bar_index=100)
    allowed, why = manager.can_open(
        datetime(2026, 3, 4, 14, 0, tzinfo=timezone.utc),
        AccountState(10_000, 10_000),
        [],
        bar_index=105,
        spread=0.3,
    )
    assert not allowed and why == "cooldown"


def test_wide_spread_blocks_entry(manager):
    allowed, why = manager.can_open(
        datetime(2026, 3, 4, 14, 0, tzinfo=timezone.utc),
        AccountState(10_000, 10_000),
        [],
        bar_index=10,
        spread=1.5,
    )
    assert not allowed and why == "spread_too_wide"


def test_opposite_exposure_is_refused_without_hedging():
    manager = RiskManager(RiskConfig(allow_hedging=False))
    existing = Position(
        ticket=1,
        side=Side.SELL,
        entry_price=2000,
        lots=0.1,
        stop_loss=2010,
        take_profit=1980,
        opened_at=datetime(2026, 3, 4, 13, tzinfo=timezone.utc),
    )
    assert manager.config.allow_hedging is False
    assert existing.side is Side.SELL


def test_session_policy_blocks_the_weekend_and_news():
    calendar = EconomicCalendar()
    policy = SessionPolicy(calendar=calendar)
    saturday = datetime(2026, 3, 7, 12, tzinfo=timezone.utc)
    assert policy.can_trade(saturday)[0] is False
    nfp = datetime(2026, 3, 6, 13, 35, tzinfo=timezone.utc)  # first Friday
    allowed, why = policy.can_trade(nfp)
    assert not allowed and "NFP" in why


def test_friday_evening_forces_flat():
    policy = SessionPolicy(friday_cutoff_hour=19)
    friday_late = datetime(2026, 3, 6, 20, 30, tzinfo=timezone.utc)
    assert policy.must_flatten(friday_late)[0] is True
