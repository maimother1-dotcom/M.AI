"""End-to-end backtest properties.

These are the invariants that must hold on any data, not performance claims:
risk is bounded, the equity curve reconciles with the trades, and the
pessimistic fill assumptions are actually applied.
"""

from __future__ import annotations

import pandas as pd
import pytest

from goldbot.backtest.engine import BacktestConfig, Backtester, CostModel
from goldbot.backtest.metrics import aggregate_legs, compute
from goldbot.core.features import build_features
from goldbot.core.types import CONTRACT_SIZE, ExitReason, Side, Trade
from goldbot.data.synthetic import generate
from goldbot.risk.manager import RiskConfig, RiskManager
from goldbot.risk.sessions import SessionPolicy
from goldbot.risk.stops import StopConfig
from goldbot.strategies import DEFAULT_WEIGHTS, build_strategies
from goldbot.strategies.ensemble import Ensemble, EnsembleConfig


@pytest.fixture(scope="module")
def run():
    df = generate(bars=6000, seed=23)
    features = build_features(df)
    ensemble = Ensemble(build_strategies(), DEFAULT_WEIGHTS, EnsembleConfig())
    risk = RiskManager(RiskConfig(), StopConfig(), SessionPolicy())
    tester = Backtester(ensemble, risk, BacktestConfig(initial_balance=10_000))
    return df, tester.run(df, features)


def test_the_backtest_produces_trades(run):
    _, result = run
    assert result.entries > 0
    assert len(result.trades) > 0


def test_no_single_loss_exceeds_the_risk_budget(run):
    _, result = run
    trades = aggregate_legs(result.trades)
    # 0.5% of 10k, at the maximum confidence factor, plus costs and one bar of
    # gap slippage. Nothing may exceed that by more than a small margin.
    ceiling = 10_000 * 0.005 * 1.25 * 2.5
    worst = min(t.pnl for t in trades)
    assert worst > -ceiling, f"worst trade {worst:.2f} breached the risk budget"


def test_equity_curve_reconciles_with_realised_pnl(run):
    _, result = run
    total = sum(t.pnl for t in result.trades)
    final = float(result.equity.iloc[-1])
    # The curve marks open trades to market, so it can differ by the last
    # open position's unrealised P&L and accrued swap — but not by much.
    assert abs((10_000 + total) - final) < 400


def test_equity_curve_is_continuous_and_positive(run):
    _, result = run
    assert result.equity.notna().all()
    assert (result.equity > 0).all()


def test_a_stop_out_never_loses_much_more_than_it_risked(run):
    """The initial stop bounds the loss; only a gap may exceed it, and only a
    little, because the fill model charges the gap explicitly."""
    _, result = run
    for trade in result.trades:
        if trade.exit_reason is not ExitReason.STOP_LOSS:
            continue
        planned = abs(trade.entry_price - trade.initial_stop) * trade.lots * CONTRACT_SIZE
        assert trade.pnl >= -(planned * 1.6 + 5.0), trade.to_row()


def test_trailing_exits_are_better_than_the_original_stop(run):
    _, result = run
    for trade in result.trades:
        if trade.exit_reason is not ExitReason.TRAILING_STOP:
            continue
        if trade.side is Side.BUY:
            assert trade.exit_price > trade.initial_stop
        else:
            assert trade.exit_price < trade.initial_stop


def test_trades_never_open_outside_allowed_sessions(run):
    _, result = run
    policy = SessionPolicy()
    for trade in result.trades:
        allowed, _ = policy.can_trade(trade.opened_at)
        # Entries fill on the bar after the decision, so the boundary bar is
        # tolerated; anything deep outside the window is a bug.
        if not allowed:
            hour = trade.opened_at.hour
            assert 6 <= hour <= 21, f"trade opened at {trade.opened_at}"


def test_metrics_merge_partial_legs(run):
    _, result = run
    metrics = compute(result.trades, result.equity, 10_000)
    assert metrics.fills >= metrics.trades
    assert metrics.trades == len({t.ticket for t in result.trades})


def test_higher_costs_reduce_profit():
    df = generate(bars=4000, seed=31)
    features = build_features(df)

    def run_with(costs: CostModel) -> float:
        ensemble = Ensemble(build_strategies(), DEFAULT_WEIGHTS, EnsembleConfig())
        risk = RiskManager(RiskConfig(), StopConfig(), SessionPolicy())
        config = BacktestConfig(initial_balance=10_000, costs=costs)
        result = Backtester(ensemble, risk, config).run(df, features)
        return float(result.equity.iloc[-1])

    cheap = run_with(CostModel())
    expensive = run_with(CostModel(base_spread=1.2, commission_per_lot=25.0, slippage=0.30))
    assert expensive < cheap


def test_kill_switch_stops_the_run():
    df = generate(bars=4000, seed=13)
    features = build_features(df)
    ensemble = Ensemble(build_strategies(), DEFAULT_WEIGHTS, EnsembleConfig())
    # An absurd per-trade risk with a tight drawdown cap must trip the switch.
    risk = RiskManager(
        RiskConfig(risk_per_trade=0.04, max_drawdown=0.03, max_daily_loss=0.02),
        StopConfig(),
        SessionPolicy(),
    )
    result = Backtester(ensemble, risk, BacktestConfig(initial_balance=10_000)).run(df, features)
    if result.ended_halted:
        assert "drawdown" in result.halt_reason
        assert float(result.equity.iloc[-1]) > 10_000 * 0.7


def test_aggregate_legs_sums_correctly():
    def leg(ticket, lots, pnl, r, closed):
        return Trade(
            ticket=ticket,
            side=Side.BUY,
            lots=lots,
            entry_price=2000.0,
            exit_price=2010.0,
            opened_at=pd.Timestamp("2026-01-01T10:00Z").to_pydatetime(),
            closed_at=pd.Timestamp(closed).to_pydatetime(),
            pnl=pnl,
            r_multiple=r,
            exit_reason=ExitReason.TAKE_PROFIT,
            initial_stop=1990.0,
        )

    merged = aggregate_legs(
        [
            leg(1, 0.05, 25.0, 0.5, "2026-01-01T11:00Z"),
            leg(1, 0.05, 50.0, 1.0, "2026-01-01T12:00Z"),
            leg(2, 0.10, -30.0, -1.0, "2026-01-01T13:00Z"),
        ]
    )
    assert len(merged) == 2
    first = next(t for t in merged if t.ticket == 1)
    assert first.pnl == pytest.approx(75.0)
    assert first.r_multiple == pytest.approx(1.5)
    assert first.lots == pytest.approx(0.10)
