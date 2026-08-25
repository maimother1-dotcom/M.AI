"""Performance statistics.

Reported honestly: drawdown is measured on the equity curve including open
trades, returns are compounded, and the trade-level statistics are computed on
closed trades only. Where a statistic is unreliable (fewer than ~30 trades)
the report says so instead of printing a confident Sharpe ratio built on nine
samples.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from ..core.types import ExitReason, Side, Trade

TRADING_DAYS = 252


def aggregate_legs(legs: list[Trade]) -> list[Trade]:
    """Merge partial exits back into one round-trip per position.

    Scaling out means a single trade can produce three fills. Counting those
    as three trades inflates the trade count and flatters the win rate — the
    partial is booked as a winner and the runner as a scratch. Statistics are
    computed on the merged round trips.
    """
    by_ticket: dict[int, list[Trade]] = {}
    for leg in legs:
        by_ticket.setdefault(leg.ticket, []).append(leg)

    merged: list[Trade] = []
    for ticket, group in by_ticket.items():
        group = sorted(group, key=lambda t: t.closed_at)
        total_lots = sum(t.lots for t in group)
        if total_lots <= 0:
            continue
        last = group[-1]
        exit_price = sum(t.exit_price * t.lots for t in group) / total_lots
        merged.append(
            Trade(
                ticket=ticket,
                side=last.side,
                lots=total_lots,
                entry_price=group[0].entry_price,
                exit_price=exit_price,
                opened_at=group[0].opened_at,
                closed_at=last.closed_at,
                pnl=sum(t.pnl for t in group),
                r_multiple=sum(t.r_multiple for t in group),
                exit_reason=last.exit_reason,
                initial_stop=group[0].initial_stop,
                bars_held=max(t.bars_held for t in group),
                commission=sum(t.commission for t in group),
                max_favourable=max(t.max_favourable for t in group),
                max_adverse=min(t.max_adverse for t in group),
                regime=group[0].regime,
                confidence=group[0].confidence,
                contributors=dict(group[0].contributors),
                comment=group[0].comment,
            )
        )
    return sorted(merged, key=lambda t: t.closed_at)


@dataclass
class Metrics:
    trades: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    net_profit: float = 0.0
    return_pct: float = 0.0
    cagr: float = 0.0
    profit_factor: float = 0.0
    expectancy_r: float = 0.0
    expectancy_usd: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    payoff: float = 0.0
    max_drawdown_pct: float = 0.0
    max_drawdown_usd: float = 0.0
    longest_drawdown_days: float = 0.0
    sharpe: float = 0.0
    sortino: float = 0.0
    calmar: float = 0.0
    ulcer_index: float = 0.0
    max_consecutive_losses: int = 0
    avg_bars_held: float = 0.0
    avg_r: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    long_trades: int = 0
    short_trades: int = 0
    long_win_rate: float = 0.0
    short_win_rate: float = 0.0
    commission: float = 0.0
    exposure_pct: float = 0.0
    kelly_fraction: float = 0.0
    fills: int = 0
    exit_breakdown: dict[str, int] = field(default_factory=dict)
    monthly_returns: dict[str, float] = field(default_factory=dict)
    reliable: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        out = {k: v for k, v in self.__dict__.items()}
        for key, value in out.items():
            if isinstance(value, float):
                out[key] = round(value, 4)
        return out


def _drawdown(equity: pd.Series) -> tuple[float, float, float]:
    peak = equity.cummax()
    drawdown = equity - peak
    dd_pct = (drawdown / peak.replace(0.0, np.nan)).fillna(0.0)
    max_pct = float(-dd_pct.min() * 100.0)
    max_usd = float(-drawdown.min())

    # Longest stretch below a previous peak, in days.
    under = equity < peak
    longest = 0.0
    if under.any():
        start: Optional[pd.Timestamp] = None
        for stamp, flag in under.items():
            if flag and start is None:
                start = stamp
            elif not flag and start is not None:
                longest = max(longest, (stamp - start).total_seconds() / 86400.0)
                start = None
        if start is not None:
            longest = max(longest, (equity.index[-1] - start).total_seconds() / 86400.0)
    return max_pct, max_usd, longest


def compute(
    trades: list[Trade],
    equity: pd.Series,
    initial_balance: float,
    bars_in_market: int = 0,
    total_bars: int = 0,
    merge_partials: bool = True,
) -> Metrics:
    """`trades` is the raw list of fills; partial exits are merged by default."""
    legs = list(trades)
    if merge_partials:
        trades = aggregate_legs(legs)
    m = Metrics()
    m.trades = len(trades)
    m.fills = len(legs)
    if equity.empty:
        m.notes.append("no equity curve")
        return m

    final = float(equity.iloc[-1])
    m.net_profit = final - initial_balance
    m.return_pct = (final / initial_balance - 1.0) * 100.0

    span_days = max((equity.index[-1] - equity.index[0]).total_seconds() / 86400.0, 1.0)
    years = span_days / 365.25
    if years > 0 and final > 0:
        m.cagr = ((final / initial_balance) ** (1.0 / years) - 1.0) * 100.0

    m.max_drawdown_pct, m.max_drawdown_usd, m.longest_drawdown_days = _drawdown(equity)
    if m.max_drawdown_pct > 0:
        m.calmar = m.cagr / m.max_drawdown_pct

    # Daily returns for the risk-adjusted ratios.
    daily = equity.resample("1D").last().dropna()
    returns = daily.pct_change().dropna()
    if len(returns) > 5:
        sd = float(returns.std())
        mean = float(returns.mean())
        if sd > 0:
            m.sharpe = mean / sd * np.sqrt(TRADING_DAYS)
        downside = returns[returns < 0]
        dsd = float(downside.std()) if len(downside) > 1 else 0.0
        if dsd > 0:
            m.sortino = mean / dsd * np.sqrt(TRADING_DAYS)
        m.monthly_returns = {
            str(period): round(float(value) * 100.0, 2)
            for period, value in daily.resample("ME").last().pct_change().dropna().items()
        }

    peak = equity.cummax()
    drawdown_pct = ((equity - peak) / peak.replace(0.0, np.nan)).fillna(0.0) * 100.0
    m.ulcer_index = float(np.sqrt((drawdown_pct**2).mean()))

    if total_bars > 0:
        m.exposure_pct = bars_in_market / total_bars * 100.0

    if not trades:
        m.notes.append("no trades taken")
        return m

    pnl = np.array([t.pnl for t in trades], dtype=float)
    r_values = np.array([t.r_multiple for t in trades], dtype=float)
    wins = pnl[pnl > 0]
    losses = pnl[pnl <= 0]

    m.wins, m.losses = int(len(wins)), int(len(losses))
    m.win_rate = m.wins / m.trades * 100.0
    m.avg_win = float(wins.mean()) if len(wins) else 0.0
    m.avg_loss = float(losses.mean()) if len(losses) else 0.0
    m.payoff = abs(m.avg_win / m.avg_loss) if m.avg_loss else 0.0
    gross_profit = float(wins.sum())
    gross_loss = abs(float(losses.sum()))
    m.profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    m.expectancy_usd = float(pnl.mean())
    m.expectancy_r = float(r_values.mean())
    m.avg_r = m.expectancy_r
    m.best_trade = float(pnl.max())
    m.worst_trade = float(pnl.min())
    m.commission = float(sum(t.commission for t in trades))
    m.avg_bars_held = float(np.mean([t.bars_held for t in trades]))

    streak = worst_streak = 0
    for value in pnl:
        if value <= 0:
            streak += 1
            worst_streak = max(worst_streak, streak)
        else:
            streak = 0
    m.max_consecutive_losses = worst_streak

    longs = [t for t in trades if t.side is Side.BUY]
    shorts = [t for t in trades if t.side is Side.SELL]
    m.long_trades, m.short_trades = len(longs), len(shorts)
    m.long_win_rate = (
        sum(1 for t in longs if t.won) / len(longs) * 100.0 if longs else 0.0
    )
    m.short_win_rate = (
        sum(1 for t in shorts if t.won) / len(shorts) * 100.0 if shorts else 0.0
    )

    # Kelly on the trade distribution, reported as a sanity check on sizing —
    # full Kelly is far too aggressive to actually use.
    if m.payoff > 0:
        p = m.win_rate / 100.0
        m.kelly_fraction = max(0.0, p - (1 - p) / m.payoff)

    counts: dict[str, int] = {}
    for trade in trades:
        key = trade.exit_reason.value if isinstance(trade.exit_reason, ExitReason) else str(trade.exit_reason)
        counts[key] = counts.get(key, 0) + 1
    m.exit_breakdown = dict(sorted(counts.items(), key=lambda kv: -kv[1]))

    m.reliable = m.trades >= 30 and len(returns) > 60
    if not m.reliable:
        m.notes.append(
            f"only {m.trades} trades over {span_days:.0f} days — treat these numbers as indicative, not significant"
        )
    return m


def format_report(m: Metrics, title: str = "Backtest") -> str:
    lines = [
        f"╔══ {title} " + "═" * max(0, 58 - len(title)),
        f"║ Net profit        {m.net_profit:>14,.2f}   Return {m.return_pct:>8.2f}%",
        f"║ CAGR              {m.cagr:>13.2f}%   Calmar {m.calmar:>8.2f}",
        f"║ Max drawdown      {m.max_drawdown_pct:>13.2f}%   ({m.max_drawdown_usd:,.0f})",
        f"║ Longest drawdown  {m.longest_drawdown_days:>13.0f}d   Ulcer  {m.ulcer_index:>8.2f}",
        f"║ Sharpe            {m.sharpe:>14.2f}   Sortino{m.sortino:>8.2f}",
        "╟" + "─" * 62,
        f"║ Trades            {m.trades:>14d}   Win rate {m.win_rate:>6.1f}%",
        f"║ Fills (incl. partials) {m.fills:>9d}",
        f"║ Profit factor     {m.profit_factor:>14.2f}   Payoff {m.payoff:>8.2f}",
        f"║ Expectancy        {m.expectancy_usd:>13.2f}$   {m.expectancy_r:>7.3f}R",
        f"║ Avg win / loss    {m.avg_win:>14,.2f} / {m.avg_loss:,.2f}",
        f"║ Best / worst      {m.best_trade:>14,.2f} / {m.worst_trade:,.2f}",
        f"║ Max losing streak {m.max_consecutive_losses:>14d}   Avg bars {m.avg_bars_held:>6.1f}",
        f"║ Long / short      {m.long_trades:>7d} / {m.short_trades:<5d}  "
        f"win {m.long_win_rate:.0f}% / {m.short_win_rate:.0f}%",
        f"║ Commission paid   {m.commission:>14,.2f}   Exposure {m.exposure_pct:>5.1f}%",
        f"║ Kelly fraction    {m.kelly_fraction:>14.3f}   (sizing sanity check)",
    ]
    if m.exit_breakdown:
        exits = ", ".join(f"{k} {v}" for k, v in m.exit_breakdown.items())
        lines.append(f"║ Exits             {exits}")
    for note in m.notes:
        lines.append(f"║ ! {note}")
    lines.append("╚" + "═" * 62)
    return "\n".join(lines)
