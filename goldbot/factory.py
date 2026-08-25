"""Wiring: turn a BotConfig into live objects.

Kept apart from both config and engine so that the engine has no idea which
broker it is talking to, and the config has no idea how to construct one.
"""

from __future__ import annotations

import logging
from typing import Optional

from .backtest.engine import Backtester
from .config import BotConfig
from .data.base import DataFeed
from .data.csv_feed import CsvFeed
from .data.synthetic import SyntheticFeed
from .execution.broker import Broker, PaperBroker
from .journal import Journal
from .notify import Notifier
from .risk.manager import RiskManager
from .strategies import build_strategies
from .strategies.ensemble import Ensemble

log = logging.getLogger("goldbot.factory")


def build_ensemble(config: BotConfig) -> Ensemble:
    strategies = build_strategies(config.strategies.enabled, config.strategies.params)
    ensemble = Ensemble(strategies, config.strategies.weights, config.ensemble)
    weights_file = config.runtime.state_path(config.runtime.weights_file)
    if weights_file.exists():
        ensemble.adaptive.load(weights_file)
        log.info("loaded adaptive weights from %s", weights_file)
    return ensemble


def build_risk(config: BotConfig) -> RiskManager:
    return RiskManager(config.risk, config.stops, config.session_policy())


def build_feed(config: BotConfig) -> DataFeed:
    source = config.data.source.lower()
    if source == "synthetic":
        return SyntheticFeed(
            bars=config.data.history_bars,
            timeframe=config.timeframe,
            seed=config.data.synthetic_seed,
        )
    if source == "csv":
        if not config.data.csv_path:
            raise ValueError("data.source is 'csv' but data.csv_path is unset")
        return CsvFeed(config.data.csv_path, config.symbol, config.timeframe)
    if source == "mt5":
        from .data.mt5_feed import MT5Feed

        return MT5Feed(
            symbol=config.mt5.symbol,
            login=config.mt5.login,
            password=config.mt5.password,
            server=config.mt5.server,
            path=config.mt5.terminal_path,
        )
    if source == "oanda":
        from .data.oanda_feed import OandaClient, OandaFeed

        client = OandaClient(
            token=config.oanda.token or "",
            account_id=config.oanda.account_id or "",
            environment=config.oanda.environment,
        )
        return OandaFeed(client, config.oanda.symbol)
    raise ValueError(f"unknown data source {config.data.source!r}")


def build_broker(config: BotConfig, feed: Optional[DataFeed] = None) -> Broker:
    """Paper mode always returns a PaperBroker, whatever `broker` says — that
    is the safety property: dry_run cannot accidentally place a real order."""
    if config.runtime.dry_run or config.broker == "paper":
        spread = None
        if feed is not None:
            try:
                spread = feed.spread()
            except Exception:  # a feed without live pricing is fine here
                spread = None
        return PaperBroker(
            balance=config.initial_balance,
            symbol=config.symbol,
            spread=spread or config.costs.base_spread,
            commission_per_lot=config.costs.commission_per_lot,
            slippage=config.costs.slippage,
            swap_long_per_lot=config.costs.swap_long_per_lot,
            swap_short_per_lot=config.costs.swap_short_per_lot,
        )
    if config.broker == "mt5":
        from .execution.mt5_broker import MT5Broker

        return MT5Broker(
            symbol=config.mt5.symbol,
            login=config.mt5.login,
            password=config.mt5.password,
            server=config.mt5.server,
            path=config.mt5.terminal_path,
            deviation=config.mt5.deviation_points,
            magic=config.mt5.magic,
        )
    if config.broker == "oanda":
        from .data.oanda_feed import OandaClient
        from .execution.oanda_broker import OandaBroker

        client = OandaClient(
            token=config.oanda.token or "",
            account_id=config.oanda.account_id or "",
            environment=config.oanda.environment,
        )
        return OandaBroker(client, config.oanda.symbol)
    raise ValueError(f"unknown broker {config.broker!r}")


def build_journal(config: BotConfig) -> Journal:
    return Journal(
        config.runtime.state_path(config.runtime.journal_file),
        config.runtime.state_path(config.runtime.equity_file),
    )


def build_notifier(config: BotConfig) -> Notifier:
    return Notifier(config.runtime.ntfy_topic, tuple(config.runtime.notify_on))


def build_backtester(config: BotConfig) -> Backtester:
    backtest_config = config.backtest
    backtest_config.costs = config.costs
    backtest_config.initial_balance = config.initial_balance
    return Backtester(
        build_ensemble(config), build_risk(config), backtest_config, config.features
    )
