"""Walk-forward analysis, random search and Monte Carlo.

A backtest on all of history tells you almost nothing: with seventeen
strategies and a weight each, anything can be fitted. These tools exist to
answer the only question that matters — does the configuration still work on
data it was never tuned on?

* `walk_forward` — roll an in-sample window, optimise, trade the next
  out-of-sample window, repeat, and report the stitched OOS curve.
* `random_search` — sample the weight/threshold space; far better than grid
  search at this dimensionality.
* `monte_carlo` — reshuffle the trade sequence to show the drawdown you were
  *lucky* to avoid, not just the one that happened.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

import numpy as np
import pandas as pd

from ..core.features import FeatureConfig, build_features
from ..core.types import Trade
from ..risk.manager import RiskConfig, RiskManager
from ..risk.sessions import SessionPolicy
from ..risk.stops import StopConfig
from ..strategies import DEFAULT_WEIGHTS, build_strategies
from ..strategies.ensemble import Ensemble, EnsembleConfig
from .engine import BacktestConfig, Backtester
from .metrics import Metrics, aggregate_legs, compute


@dataclass
class Candidate:
    weights: dict[str, float]
    entry_threshold: float
    min_agreement: float
    min_voters: int
    atr_mult: float
    take_profit_r: float
    risk_per_trade: float

    def describe(self) -> str:
        return (
            f"thr={self.entry_threshold:.2f} agree={self.min_agreement:.2f} "
            f"voters={self.min_voters} atr={self.atr_mult:.1f} "
            f"tp={self.take_profit_r:.1f}R risk={self.risk_per_trade:.3%}"
        )


def default_candidate() -> Candidate:
    ens = EnsembleConfig()
    stops = StopConfig()
    risk = RiskConfig()
    return Candidate(
        weights=dict(DEFAULT_WEIGHTS),
        entry_threshold=ens.entry_threshold,
        min_agreement=ens.min_agreement,
        min_voters=ens.min_voters,
        atr_mult=stops.atr_mult,
        take_profit_r=stops.take_profit_r,
        risk_per_trade=risk.risk_per_trade,
    )


def sample_candidate(rng: random.Random, base: Optional[Candidate] = None) -> Candidate:
    base = base or default_candidate()
    weights = {
        name: round(max(0.0, rng.gauss(value, 0.35)), 2)
        for name, value in base.weights.items()
    }
    return Candidate(
        weights=weights,
        entry_threshold=round(rng.uniform(0.25, 0.55), 3),
        min_agreement=round(rng.uniform(0.5, 0.85), 3),
        min_voters=rng.choice([2, 2, 3, 3, 4]),
        atr_mult=round(rng.uniform(1.2, 2.8), 2),
        take_profit_r=round(rng.uniform(1.8, 4.0), 2),
        risk_per_trade=round(rng.uniform(0.0025, 0.0075), 5),
    )


def build_backtester(
    candidate: Candidate,
    session_policy: Optional[SessionPolicy] = None,
    backtest_config: Optional[BacktestConfig] = None,
    strategy_names: Optional[Sequence[str]] = None,
) -> Backtester:
    ensemble = Ensemble(
        build_strategies(strategy_names),
        candidate.weights,
        EnsembleConfig(
            entry_threshold=candidate.entry_threshold,
            min_agreement=candidate.min_agreement,
            min_voters=candidate.min_voters,
        ),
    )
    stops = StopConfig(atr_mult=candidate.atr_mult, take_profit_r=candidate.take_profit_r)
    risk = RiskManager(
        RiskConfig(risk_per_trade=candidate.risk_per_trade),
        stops,
        session_policy or SessionPolicy(),
    )
    return Backtester(ensemble, risk, backtest_config or BacktestConfig())


def score_metrics(m: Metrics, min_trades: int = 25) -> float:
    """Objective function for the search.

    Deliberately not raw return: a configuration that makes 40% with a 30%
    drawdown on twelve trades is worse than one making 18% with a 6% drawdown
    on two hundred. Penalises thin samples and rewards drawdown-adjusted
    expectancy.
    """
    if m.trades < min_trades:
        return -1e6 + m.trades
    if m.max_drawdown_pct <= 0:
        return -1e6
    calmar = m.cagr / max(m.max_drawdown_pct, 1.0)
    sample_penalty = min(1.0, m.trades / 100.0)
    profit_factor = min(m.profit_factor, 4.0) if np.isfinite(m.profit_factor) else 1.0
    return float(
        (0.5 * calmar + 0.3 * m.sharpe + 0.2 * (profit_factor - 1.0) * 2.0)
        * sample_penalty
    )


def evaluate(
    candidate: Candidate,
    df: pd.DataFrame,
    features: Optional[pd.DataFrame] = None,
    initial_balance: float = 10_000.0,
    session_policy: Optional[SessionPolicy] = None,
    backtest_config: Optional[BacktestConfig] = None,
) -> tuple[Metrics, list[Trade]]:
    tester = build_backtester(candidate, session_policy, backtest_config)
    result = tester.run(df, features)
    metrics = compute(
        result.trades,
        result.equity,
        initial_balance,
        result.bars_in_market,
        result.total_bars,
    )
    return metrics, result.trades


def random_search(
    df: pd.DataFrame,
    iterations: int = 40,
    seed: int = 0,
    features: Optional[pd.DataFrame] = None,
    base: Optional[Candidate] = None,
    on_result: Optional[Callable[[int, Candidate, Metrics, float], None]] = None,
    **evaluate_kwargs,
) -> tuple[Candidate, Metrics, list[tuple[Candidate, Metrics, float]]]:
    rng = random.Random(seed)
    feats = features if features is not None else build_features(df)
    history: list[tuple[Candidate, Metrics, float]] = []

    best_candidate = base or default_candidate()
    best_metrics, _ = evaluate(best_candidate, df, feats, **evaluate_kwargs)
    best_score = score_metrics(best_metrics)
    history.append((best_candidate, best_metrics, best_score))
    if on_result:
        on_result(0, best_candidate, best_metrics, best_score)

    for step in range(1, iterations + 1):
        candidate = sample_candidate(rng, best_candidate if rng.random() < 0.6 else None)
        metrics, _ = evaluate(candidate, df, feats, **evaluate_kwargs)
        score = score_metrics(metrics)
        history.append((candidate, metrics, score))
        if on_result:
            on_result(step, candidate, metrics, score)
        if score > best_score:
            best_candidate, best_metrics, best_score = candidate, metrics, score
    return best_candidate, best_metrics, history


@dataclass
class WalkForwardFold:
    index: int
    train_start: pd.Timestamp
    train_end: pd.Timestamp
    test_start: pd.Timestamp
    test_end: pd.Timestamp
    candidate: Candidate
    in_sample: Metrics
    out_of_sample: Metrics
    trades: list[Trade] = field(default_factory=list)


@dataclass
class WalkForwardReport:
    folds: list[WalkForwardFold]
    combined: Metrics
    efficiency: float

    def summary(self) -> str:
        lines = [
            f"Walk-forward: {len(self.folds)} folds, "
            f"efficiency {self.efficiency:.2f} (OOS/IS return ratio)",
        ]
        for fold in self.folds:
            lines.append(
                f"  fold {fold.index}: train {fold.train_start.date()}→{fold.train_end.date()} "
                f"IS {fold.in_sample.return_pct:+.1f}%  |  "
                f"test {fold.test_start.date()}→{fold.test_end.date()} "
                f"OOS {fold.out_of_sample.return_pct:+.1f}% "
                f"({fold.out_of_sample.trades} trades, DD {fold.out_of_sample.max_drawdown_pct:.1f}%)"
            )
        return "\n".join(lines)


def walk_forward(
    df: pd.DataFrame,
    folds: int = 4,
    train_fraction: float = 0.6,
    iterations: int = 15,
    seed: int = 0,
    initial_balance: float = 10_000.0,
    feature_config: Optional[FeatureConfig] = None,
    session_policy: Optional[SessionPolicy] = None,
    verbose: bool = True,
) -> WalkForwardReport:
    features = build_features(df, feature_config or FeatureConfig())
    total = len(df)
    if folds < 1 or total < 2000:
        raise ValueError("need at least 2000 bars and one fold")

    window = int(total / (folds * (1 - train_fraction) + train_fraction))
    train_size = int(window * train_fraction)
    test_size = window - train_size
    if train_size < 800 or test_size < 300:
        raise ValueError("not enough data for the requested fold layout")

    results: list[WalkForwardFold] = []
    equity_pieces: list[pd.Series] = []
    all_trades: list[Trade] = []
    balance = initial_balance

    for fold in range(folds):
        train_start = fold * test_size
        train_end = train_start + train_size
        test_end = min(train_end + test_size, total)
        if test_end - train_end < 200:
            break

        train_df = df.iloc[train_start:train_end]
        train_feat = features.iloc[train_start:train_end]
        test_df = df.iloc[train_end - 300 : test_end]  # carry warmup into the test
        test_feat = features.iloc[train_end - 300 : test_end]

        if verbose:
            print(f"fold {fold + 1}/{folds}: optimising on {len(train_df)} bars…")
        candidate, in_sample, _ = random_search(
            train_df,
            iterations=iterations,
            seed=seed + fold,
            features=train_feat,
            initial_balance=initial_balance,
            session_policy=session_policy,
        )

        oos_config = BacktestConfig(initial_balance=balance, warmup_bars=300)
        tester = build_backtester(candidate, session_policy, oos_config)
        oos = tester.run(test_df, test_feat)
        oos_metrics = compute(
            oos.trades, oos.equity, balance, oos.bars_in_market, oos.total_bars
        )

        results.append(
            WalkForwardFold(
                index=fold + 1,
                train_start=train_df.index[0],
                train_end=train_df.index[-1],
                test_start=test_df.index[300] if len(test_df) > 300 else test_df.index[0],
                test_end=test_df.index[-1],
                candidate=candidate,
                in_sample=in_sample,
                out_of_sample=oos_metrics,
                trades=oos.trades,
            )
        )
        equity_pieces.append(oos.equity.iloc[300:])
        all_trades.extend(oos.trades)
        balance = float(oos.equity.iloc[-1])
        if verbose:
            print(
                f"  IS {in_sample.return_pct:+.1f}%  OOS {oos_metrics.return_pct:+.1f}% "
                f"({oos_metrics.trades} trades)"
            )

    combined_equity = (
        pd.concat(equity_pieces) if equity_pieces else pd.Series(dtype=float)
    )
    combined_equity = combined_equity[~combined_equity.index.duplicated(keep="last")].sort_index()
    combined = compute(all_trades, combined_equity, initial_balance)

    is_return = np.mean([f.in_sample.return_pct for f in results]) if results else 0.0
    oos_return = np.mean([f.out_of_sample.return_pct for f in results]) if results else 0.0
    efficiency = float(oos_return / is_return) if is_return not in (0.0, np.nan) else 0.0
    return WalkForwardReport(folds=results, combined=combined, efficiency=efficiency)


def monte_carlo(
    trades: Sequence[Trade],
    initial_balance: float = 10_000.0,
    runs: int = 2000,
    seed: int = 0,
    risk_per_trade: float = 0.005,
) -> dict[str, float]:
    """Bootstrap the trade distribution to size for the run you did not get.

    Partial legs are merged first, then round trips are resampled **with
    replacement** and compounded at `risk_per_trade`. Resampling matters:
    merely reshuffling a fixed list of P&L leaves the final balance identical
    in every run, which tells you nothing about the outcomes you were spared.

    Read the p95 drawdown, not the median: position sizing has to survive the
    unlucky ordering, because sooner or later it arrives.
    """
    round_trips = aggregate_legs(list(trades))
    if not round_trips:
        return {}
    r_values = np.array([t.r_multiple for t in round_trips], dtype=float)
    r_values = r_values[np.isfinite(r_values)]
    if r_values.size == 0:
        return {}

    rng = np.random.default_rng(seed)
    count = len(r_values)
    samples = rng.choice(r_values, size=(runs, count), replace=True)

    finals = np.empty(runs)
    drawdowns = np.empty(runs)
    ruin = 0
    for run in range(runs):
        equity = initial_balance * np.cumprod(1.0 + risk_per_trade * samples[run])
        peak = np.maximum.accumulate(np.concatenate([[initial_balance], equity]))[1:]
        drawdowns[run] = float(np.max((peak - equity) / peak) * 100.0)
        finals[run] = equity[-1]
        if equity.min() <= initial_balance * 0.5:
            ruin += 1

    return {
        "trades_per_run": float(count),
        "median_final": float(np.median(finals)),
        "p05_final": float(np.percentile(finals, 5)),
        "p95_final": float(np.percentile(finals, 95)),
        "median_max_dd_pct": float(np.median(drawdowns)),
        "p95_max_dd_pct": float(np.percentile(drawdowns, 95)),
        "worst_max_dd_pct": float(np.max(drawdowns)),
        "prob_50pct_loss": ruin / runs,
        "prob_profit": float((finals > initial_balance).mean()),
    }
