"""Command line interface.

    python -m goldbot backtest --bars 40000
    python -m goldbot paper --replay --bars 8000
    python -m goldbot live --config my.yaml
    python -m goldbot walkforward --folds 4
    python -m goldbot status

Every command takes `--config`; without one, the packaged defaults are used.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import pandas as pd

from . import config as config_module
from .backtest import compute, format_report
from .backtest.walkforward import (
    monte_carlo,
    random_search,
    score_metrics,
    walk_forward,
)
from .config import BotConfig
from .core.types import AccountState
from .core.features import MarketView, build_features
from .data.csv_feed import CsvFeed, write_csv
from .data.replay import ReplayFeed
from .data.synthetic import generate
from .execution.engine import TradingEngine
from .factory import (
    build_backtester,
    build_broker,
    build_ensemble,
    build_feed,
    build_journal,
    build_notifier,
    build_risk,
)
from .journal import Journal
from .logging_setup import configure

BANNER = r"""
   ____       _     _ ____        _
  / ___| ___ | | __| | __ )  ___ | |_
 | |  _ / _ \| |/ _` |  _ \ / _ \| __|
 | |_| | (_) | | (_| | |_) | (_) | |_
  \____|\___/|_|\__,_|____/ \___/ \__|   XAU/USD
"""


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def load_config(args) -> BotConfig:
    cfg = config_module.load(args.config)
    if getattr(args, "balance", None):
        cfg.initial_balance = float(args.balance)
        cfg.backtest.initial_balance = cfg.initial_balance
    if getattr(args, "risk", None):
        cfg.risk.risk_per_trade = float(args.risk)
    if getattr(args, "timeframe", None):
        cfg.timeframe = args.timeframe
    if getattr(args, "csv", None):
        cfg.data.source = "csv"
        cfg.data.csv_path = args.csv
    if getattr(args, "bars", None):
        cfg.data.history_bars = int(args.bars)
    if getattr(args, "seed", None) is not None:
        cfg.data.synthetic_seed = int(args.seed)
    configure(cfg.runtime.log_level, cfg.runtime.state_path(cfg.runtime.log_file or "goldbot.log"))
    return cfg


def load_history(cfg: BotConfig) -> pd.DataFrame:
    """Bars for offline work (backtest, optimise, replay)."""
    source = cfg.data.source.lower()
    if source == "csv":
        if not cfg.data.csv_path:
            raise SystemExit("data.source is 'csv' but no --csv/csv_path given")
        return CsvFeed(cfg.data.csv_path, cfg.symbol, cfg.timeframe).full()
    if source in {"mt5", "oanda"}:
        feed = build_feed(cfg)
        return feed.history(cfg.timeframe, cfg.data.history_bars)
    return generate(
        bars=cfg.data.history_bars,
        timeframe=cfg.timeframe,
        seed=cfg.data.synthetic_seed,
    )


def describe_data(df: pd.DataFrame) -> str:
    return (
        f"{len(df):,} bars  {df.index[0]:%Y-%m-%d} → {df.index[-1]:%Y-%m-%d}  "
        f"price {df['close'].min():,.0f}–{df['close'].max():,.0f}"
    )


def _warn_if_synthetic(cfg: BotConfig) -> None:
    if cfg.data.source.lower() == "synthetic":
        print(
            "\n! Synthetic data. These numbers prove the machinery runs end to end;\n"
            "  they are NOT evidence of an edge. Point --csv at real XAUUSD history\n"
            "  before believing any of it.\n"
        )


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------
def cmd_backtest(args) -> int:
    cfg = load_config(args)
    problems = cfg.validate()
    if problems and not args.force:
        print("config problems:\n  - " + "\n  - ".join(problems))
        return 2

    df = load_history(cfg)
    print(BANNER)
    print(describe_data(df))
    features = build_features(df, cfg.features)
    tester = build_backtester(cfg)
    result = tester.run(df, features, progress=args.progress)
    metrics = compute(
        result.trades,
        result.equity,
        cfg.initial_balance,
        result.bars_in_market,
        result.total_bars,
    )
    print(format_report(metrics, f"{cfg.symbol} {cfg.timeframe}"))

    if result.ended_halted:
        print(f"\n!! run stopped early: {result.halt_reason}")
    if result.rejections:
        top = ", ".join(f"{k}={v}" for k, v in list(result.rejections.items())[:8])
        print(f"\nfilters that blocked entries: {top}")
    if result.strategy_stats:
        print("\nstrategy expectancy (adaptive weighting):")
        for name, stats in sorted(
            result.strategy_stats.items(), key=lambda kv: -kv[1]["expectancy_r"]
        ):
            print(
                f"  {name:<18} {stats['expectancy_r']:+.3f}R  "
                f"weight ×{stats['multiplier']:.2f}  ({stats['trades']:.0f} votes)"
            )

    if args.montecarlo and result.trades:
        mc = monte_carlo(
            result.trades,
            cfg.initial_balance,
            runs=args.montecarlo,
            risk_per_trade=cfg.risk.risk_per_trade,
        )
        print("\nMonte Carlo (trade order reshuffled):")
        for key, value in mc.items():
            print(f"  {key:<20} {value:,.3f}")

    if args.out:
        out = Path(args.out).expanduser()
        out.mkdir(parents=True, exist_ok=True)
        pd.DataFrame([t.to_row() for t in result.trades]).to_csv(out / "trades.csv", index=False)
        result.equity.to_csv(out / "equity.csv")
        (out / "metrics.json").write_text(json.dumps(metrics.to_dict(), indent=2))
        print(f"\nwritten to {out}")

    _warn_if_synthetic(cfg)
    return 0


def cmd_paper(args) -> int:
    cfg = load_config(args)
    cfg.runtime.dry_run = True
    if args.replay:
        cfg.runtime.poll_seconds = 0
    if args.cycles:
        cfg.runtime.max_cycles = int(args.cycles)

    print(BANNER)
    if args.replay:
        df = load_history(cfg)
        print(f"replaying {describe_data(df)}")
        feed = ReplayFeed(
            df,
            symbol=cfg.symbol,
            timeframe=cfg.timeframe,
            start_at=max(400, cfg.features.slow_ema + 120),
            spread=cfg.costs.base_spread,
        )
    else:
        feed = build_feed(cfg)

    engine = TradingEngine(
        cfg,
        feed,
        build_broker(cfg, feed),
        build_ensemble(cfg),
        build_risk(cfg),
        build_journal(cfg),
        build_notifier(cfg),
    )
    engine.run()
    broker = engine.broker
    trades = getattr(broker, "closed_trades", [])
    account = broker.account()
    print(
        f"\npaper run finished: {engine._run_bars} bars, "
        f"{engine._run_opened} opened, {engine._run_closed} closed, "
        f"balance {account.balance:,.2f} (started {cfg.initial_balance:,.2f})"
    )
    if trades:
        equity = pd.Series(
            [cfg.initial_balance + sum(t.pnl for t in trades[: i + 1]) for i in range(len(trades))],
            index=pd.DatetimeIndex([t.closed_at for t in trades]),
        )
        print(
            format_report(
                compute(
                    trades,
                    equity,
                    cfg.initial_balance,
                    engine._run_bars_in_market,
                    engine._run_bars,
                ),
                "Paper run",
            )
        )
    return 0


def cmd_live(args) -> int:
    cfg = load_config(args)
    cfg.runtime.dry_run = False
    problems = cfg.validate()
    if problems:
        print("refusing to trade live:\n  - " + "\n  - ".join(problems))
        return 2
    if cfg.broker == "paper":
        print("broker is 'paper'; set broker: mt5 or oanda to trade a real account")
        return 2

    print(BANNER)
    print(
        f"LIVE on {cfg.broker.upper()} — {cfg.symbol} {cfg.timeframe}, "
        f"risk {cfg.risk.risk_per_trade:.2%}/trade, daily stop {cfg.risk.max_daily_loss:.1%}"
    )
    if not args.yes:
        answer = input("type TRADE to start: ").strip()
        if answer != "TRADE":
            print("aborted")
            return 1

    feed = build_feed(cfg)
    engine = TradingEngine(
        cfg,
        feed,
        build_broker(cfg, feed),
        build_ensemble(cfg),
        build_risk(cfg),
        build_journal(cfg),
        build_notifier(cfg),
    )
    engine.run()
    return 0


def cmd_optimize(args) -> int:
    cfg = load_config(args)
    df = load_history(cfg)
    features = build_features(df, cfg.features)
    print(BANNER)
    print(describe_data(df))
    print(f"random search, {args.iterations} iterations…")

    def report(step, candidate, metrics, score):
        print(
            f"  [{step:>3}] score {score:>7.3f}  "
            f"ret {metrics.return_pct:>7.2f}%  dd {metrics.max_drawdown_pct:>5.2f}%  "
            f"trades {metrics.trades:>4}  {candidate.describe()}"
        )

    best, metrics, history = random_search(
        df,
        iterations=args.iterations,
        seed=args.seed or 0,
        features=features,
        initial_balance=cfg.initial_balance,
        session_policy=cfg.session_policy(),
        on_result=report,
    )
    print("\nbest configuration:")
    print(f"  {best.describe()}  score {score_metrics(metrics):.3f}")
    print(format_report(metrics, "Best (in-sample)"))
    print(
        "\n! In-sample only. Run `walkforward` before trusting these settings —\n"
        "  a random search will always find something that fits the past.\n"
    )

    if args.apply:
        cfg.strategies.weights = best.weights
        cfg.ensemble.entry_threshold = best.entry_threshold
        cfg.ensemble.min_agreement = best.min_agreement
        cfg.ensemble.min_voters = best.min_voters
        cfg.stops.atr_mult = best.atr_mult
        cfg.stops.take_profit_r = best.take_profit_r
        cfg.risk.risk_per_trade = best.risk_per_trade
        path = cfg.save(args.apply)
        print(f"written to {path}")
    return 0


def cmd_walkforward(args) -> int:
    cfg = load_config(args)
    df = load_history(cfg)
    print(BANNER)
    print(describe_data(df))
    report = walk_forward(
        df,
        folds=args.folds,
        train_fraction=args.train_fraction,
        iterations=args.iterations,
        seed=args.seed or 0,
        initial_balance=cfg.initial_balance,
        feature_config=cfg.features,
        session_policy=cfg.session_policy(),
    )
    print()
    print(report.summary())
    print()
    print(format_report(report.combined, "Out-of-sample, stitched"))
    if report.efficiency < 0.4:
        print(
            "\n! Walk-forward efficiency below 0.4: the tuning is fitting noise.\n"
            "  Widen the training window or cut the number of free parameters."
        )
    _warn_if_synthetic(cfg)
    return 0


def cmd_status(args) -> int:
    cfg = load_config(args)
    journal = Journal(
        cfg.runtime.state_path(cfg.runtime.journal_file),
        cfg.runtime.state_path(cfg.runtime.equity_file),
    )
    exits = journal.read("exit")
    entries = journal.read("entry")
    print(BANNER)
    print(f"journal: {journal.path}")
    if exits.empty:
        print("no closed trades recorded yet")
        return 0

    pnl = exits["pnl"].astype(float)
    wins = pnl[pnl > 0]
    print(f"\nclosed trades   {len(exits)}")
    print(f"net p&l         {pnl.sum():+,.2f}")
    print(f"win rate        {len(wins) / len(pnl) * 100:.1f}%")
    print(f"expectancy      {pnl.mean():+,.2f} per trade")
    if "r" in exits.columns:
        print(f"expectancy (R)  {exits['r'].astype(float).mean():+.3f}")
    print(f"open entries    {len(entries)}")

    attribution = journal.strategy_attribution()
    if not attribution.empty:
        print("\nper-strategy attribution:")
        print(attribution.to_string())
    return 0


def cmd_signals(args) -> int:
    """What the committee thinks right now — the bot's reasoning, printed."""
    cfg = load_config(args)
    df = load_history(cfg)
    features = build_features(df, cfg.features)
    view = MarketView(df, features, len(df) - 1, cfg.symbol)

    ensemble = build_ensemble(cfg)
    decision = ensemble.evaluate(view)

    print(BANNER)
    print(f"bar        {view.index}  close {view.close:,.2f}")
    print(f"regime     {view.regime.value}   trend bias {view.f('trend_bias'):+.2f}")
    print(f"ATR        {view.f('atr'):.2f}  ({view.f('atr_pct'):.2f}% of price)   "
          f"ADX {view.f('adx'):.0f}   RSI {view.f('rsi'):.0f}")
    tradable, why = cfg.session_policy().can_trade(view.time)
    print(f"session    {'open' if tradable else 'CLOSED — ' + why}")

    print("\nvotes:")
    for signal in sorted(decision.signals, key=lambda s: -abs(s.score)):
        weight = ensemble.effective_weight(
            next(s for s in ensemble.strategies if s.name == signal.name), decision.regime
        )
        arrow = {1: "LONG ", -1: "SHORT", 0: "  ·  "}[signal.direction.value]
        detail = signal.reason if signal.direction.value else f"({signal.reason})"
        print(f"  {signal.name:<18} {arrow} {signal.confidence:>4.2f} × w{weight:<5.2f}  {detail}")

    print(f"\nensemble   {decision.describe()}")
    if decision.rejected:
        print(f"refused    {decision.rejected}")
        return 0

    risk = build_risk(cfg)
    account = AccountState(balance=cfg.initial_balance, equity=cfg.initial_balance)
    plan, why = risk.build_plan(
        decision, view, account, [], len(df) - 1, cfg.costs.base_spread
    )
    if plan is None:
        print(f"no trade   {why}")
        return 0
    print(
        f"\nwould {plan.side.value} {plan.lots:.2f} lots @ {plan.entry:,.2f}\n"
        f"  stop     {plan.stop_loss:,.2f}  ({plan.stop_distance:.2f} away, "
        f"risking {plan.risk_amount:,.2f})\n"
        f"  target   {plan.take_profit:,.2f}  ({plan.reward_risk:.2f}R)\n"
        f"  partial  {plan.partial_tp:,.2f}  ({plan.partial_fraction:.0%} off)"
    )
    return 0


def cmd_data(args) -> int:
    cfg = load_config(args)
    df = load_history(cfg)
    path = write_csv(df, args.out)
    print(f"{describe_data(df)}\nwritten to {path}")
    return 0


def cmd_init(args) -> int:
    cfg = BotConfig()
    path = cfg.save(args.out)
    print(f"wrote default configuration to {path}")
    print("edit it, then run:  python -m goldbot backtest --config", path)
    return 0


def cmd_doctor(args) -> int:
    cfg = load_config(args)
    print(BANNER)
    print(f"config      {args.config or config_module.DEFAULT_CONFIG_PATH}")
    print(f"symbol      {cfg.symbol} {cfg.timeframe}")
    print(f"broker      {cfg.broker} (dry_run={cfg.runtime.dry_run})")
    print(f"data        {cfg.data.source}")
    print(f"state dir   {Path(cfg.runtime.state_dir).expanduser()}")
    print(f"strategies  {len(build_ensemble(cfg, load_adaptive=False).strategies)} enabled")

    problems = cfg.validate()
    print("\nvalidation:", "OK" if not problems else "")
    for problem in problems:
        print(f"  ! {problem}")

    print("\nrisk budget:")
    balance = cfg.initial_balance
    print(f"  per trade        {cfg.risk.risk_per_trade:.2%}  ({balance * cfg.risk.risk_per_trade:,.2f})")
    print(f"  daily stop       {cfg.risk.max_daily_loss:.2%}  ({balance * cfg.risk.max_daily_loss:,.2f})")
    print(f"  kill switch      {cfg.risk.max_drawdown:.2%}  ({balance * cfg.risk.max_drawdown:,.2f})")
    print(f"  max positions    {cfg.risk.max_open_positions}")
    print(f"  worst day        {cfg.risk.max_trades_per_day} trades × {cfg.risk.risk_per_trade:.2%}"
          f" = {cfg.risk.max_trades_per_day * cfg.risk.risk_per_trade:.1%} before the daily stop bites")

    try:
        feed = build_feed(cfg)
        df = feed.latest(cfg.timeframe, 300)
        print(f"\nfeed OK: {describe_data(df)}")
        print(f"spread: {feed.spread()}")
        feed.close()
    except Exception as exc:
        print(f"\nfeed FAILED: {exc}")
        return 1

    if cfg.broker != "paper" and not cfg.runtime.dry_run:
        try:
            broker = build_broker(cfg)
            account = broker.account()
            print(f"broker OK: balance {account.balance:,.2f} equity {account.equity:,.2f}")
            broker.shutdown()
        except Exception as exc:
            print(f"broker FAILED: {exc}")
            return 1
    return 0 if not problems else 2


# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="goldbot", description="Autonomous XAU/USD trading bot"
    )
    parser.add_argument("--config", help="path to a YAML config")

    subparsers = parser.add_subparsers(dest="command", required=True)

    def common(sub):
        sub.add_argument("--csv", help="use this CSV of XAUUSD bars")
        sub.add_argument("--bars", type=int, help="how many bars to use")
        sub.add_argument("--timeframe", help="M5 / M15 / M30 / H1 / H4")
        sub.add_argument("--balance", type=float, help="starting balance")
        sub.add_argument("--risk", type=float, help="risk per trade, e.g. 0.005")
        sub.add_argument("--seed", type=int, help="synthetic data seed")
        return sub

    backtest = common(subparsers.add_parser("backtest", help="run a historical simulation"))
    backtest.add_argument("--out", help="directory for trades.csv / equity.csv / metrics.json")
    backtest.add_argument("--montecarlo", type=int, default=0, metavar="RUNS")
    backtest.add_argument("--progress", action="store_true")
    backtest.add_argument("--force", action="store_true", help="run despite config warnings")
    backtest.set_defaults(func=cmd_backtest)

    paper = common(subparsers.add_parser("paper", help="run the live engine on a simulated account"))
    paper.add_argument("--replay", action="store_true", help="replay history instead of waiting for live bars")
    paper.add_argument("--cycles", type=int, help="stop after N cycles")
    paper.set_defaults(func=cmd_paper)

    live = subparsers.add_parser("live", help="trade a real account")
    live.add_argument("--yes", action="store_true", help="skip the typed confirmation")
    live.set_defaults(func=cmd_live)

    optimize = common(subparsers.add_parser("optimize", help="random search over weights and thresholds"))
    optimize.add_argument("--iterations", type=int, default=30)
    optimize.add_argument("--apply", help="write the winning settings to this YAML path")
    optimize.set_defaults(func=cmd_optimize)

    wf = common(subparsers.add_parser("walkforward", help="out-of-sample validation"))
    wf.add_argument("--folds", type=int, default=4)
    wf.add_argument("--train-fraction", type=float, default=0.6, dest="train_fraction")
    wf.add_argument("--iterations", type=int, default=12)
    wf.set_defaults(func=cmd_walkforward)

    signals = common(subparsers.add_parser("signals", help="show the committee's current view"))
    signals.set_defaults(func=cmd_signals)

    status = subparsers.add_parser("status", help="summarise the trade journal")
    status.set_defaults(func=cmd_status)

    data = common(subparsers.add_parser("data", help="export bars to CSV"))
    data.add_argument("--out", required=True)
    data.set_defaults(func=cmd_data)

    init = subparsers.add_parser("init", help="write a starter config")
    init.add_argument("--out", default="gold.yaml")
    init.set_defaults(func=cmd_init)

    doctor = subparsers.add_parser("doctor", help="check config, data and broker connectivity")
    doctor.set_defaults(func=cmd_doctor)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\ninterrupted")
        return 130


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
