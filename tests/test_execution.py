"""Paper broker mechanics: fills, costs, partials, stops."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from goldbot.core.types import CONTRACT_SIZE, ExitReason, Regime, Side, TradePlan
from goldbot.execution.broker import PaperBroker


def plan(side: Side = Side.BUY, lots: float = 0.10) -> TradePlan:
    entry, stop, target = (
        (2000.0, 1990.0, 2025.0) if side is Side.BUY else (2000.0, 2010.0, 1975.0)
    )
    return TradePlan(
        side=side,
        entry=entry,
        stop_loss=stop,
        take_profit=target,
        lots=lots,
        risk_amount=lots * abs(entry - stop) * CONTRACT_SIZE,
        risk_per_lot=abs(entry - stop) * CONTRACT_SIZE,
        confidence=0.6,
        regime=Regime.WEAK_TREND,
        partial_tp=2010.0,
        partial_fraction=0.5,
    )


@pytest.fixture
def broker() -> PaperBroker:
    b = PaperBroker(balance=10_000, spread=0.30, commission_per_lot=7.0, slippage=0.05)
    b.update_price(2000.0, datetime(2026, 1, 5, 12, tzinfo=timezone.utc))
    return b


def test_buy_fills_at_the_ask_plus_slippage(broker):
    position = broker.open(plan())
    assert position.entry_price == pytest.approx(2000.0 + 0.15 + 0.05)


def test_sell_fills_at_the_bid_minus_slippage(broker):
    position = broker.open(plan(Side.SELL))
    assert position.entry_price == pytest.approx(2000.0 - 0.15 - 0.05)


def test_commission_is_charged_on_entry(broker):
    before = broker.account().balance
    broker.open(plan(lots=0.20))
    assert broker.account().balance == pytest.approx(before - 0.20 * 7.0)


def test_stop_loss_closes_the_position(broker):
    broker.open(plan())
    trades = broker.update_price(1989.0)
    assert len(trades) == 1
    assert trades[0].exit_reason is ExitReason.STOP_LOSS
    assert trades[0].pnl < 0
    assert broker.positions() == []


def test_take_profit_closes_the_position(broker):
    broker.open(plan())
    trades = broker.update_price(2026.0)
    assert trades and trades[0].exit_reason is ExitReason.TAKE_PROFIT
    assert trades[0].pnl > 0


def test_partial_close_leaves_the_remainder_open(broker):
    position = broker.open(plan(lots=0.20))
    trade = broker.close(position, 0.5, ExitReason.PARTIAL_TP)
    assert trade is not None and trade.lots == pytest.approx(0.10)
    remaining = broker.positions()
    assert len(remaining) == 1 and remaining[0].lots == pytest.approx(0.10)


def test_partial_r_multiples_sum_to_the_whole_trade(broker):
    position = broker.open(plan(lots=0.20))
    risk = position.initial_risk_per_unit
    broker.update_price(position.entry_price + risk)  # +1R
    first = broker.close(position, 0.5, ExitReason.PARTIAL_TP)
    broker.update_price(position.entry_price + 2 * risk)  # +2R
    second = broker.close(broker.positions()[0], 1.0, ExitReason.TAKE_PROFIT)
    # Half the size at 1R plus half at 2R is 1.5R on the original position.
    assert first.r_multiple + second.r_multiple == pytest.approx(1.5, abs=0.02)


def test_pnl_arithmetic_matches_contract_size(broker):
    position = broker.open(plan(lots=0.10))
    entry = position.entry_price
    trades = broker.update_price(2030.0)
    trade = trades[0]
    expected = (trade.exit_price - entry) * 0.10 * CONTRACT_SIZE - trade.commission
    assert trade.pnl == pytest.approx(expected, abs=0.01)


def test_modify_tightens_the_stop(broker):
    position = broker.open(plan())
    assert broker.modify(position, stop_loss=1995.0)
    assert broker.positions()[0].stop_loss == pytest.approx(1995.0)


def test_close_all_flattens_the_account(broker):
    broker.open(plan())
    broker.open(plan(Side.BUY, 0.05))
    closed = broker.close_all(ExitReason.SESSION_END)
    assert len(closed) == 2 and broker.positions() == []


def test_swap_is_charged_to_longs(broker):
    broker.open(plan(lots=1.0))
    before = broker.account().balance
    broker.charge_swap(1)
    assert broker.account().balance < before
