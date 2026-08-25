"""The live trading engine.

One loop, one responsibility per step, and the same decision path the
backtester exercised. The engine acts only on **closed** bars, so what it sees
live is exactly what it saw in the backtest — the single most common source of
"it worked in testing" is a bot that acts on a forming bar.

Safety properties, in order of importance:

1. Nothing is ever opened without a stop attached at the broker.
2. `dry_run` routes every order to the paper broker; going live is a separate,
   deliberate config change.
3. Any unhandled error halts trading rather than continuing blind, and the
   halt is pushed to the phone.
4. State survives a restart: open positions are re-adopted from the broker,
   adaptive weights and daily counters are reloaded from disk.
"""

from __future__ import annotations

import json
import logging
import signal
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from ..config import BotConfig
from ..core.features import MarketView, build_features
from ..core.types import (
    CONTRACT_SIZE,
    AccountState,
    Direction,
    ExitReason,
    Position,
    Side,
    Trade,
    as_utc,
    round_lots,
    utcnow,
)
from ..data.base import DataFeed
from ..journal import Journal
from ..notify import Notifier
from ..risk.manager import RiskManager
from ..risk.stops import manage_position
from ..strategies.ensemble import Ensemble
from .broker import Broker, PaperBroker

log = logging.getLogger("goldbot.engine")


@dataclass
class EngineState:
    """Persisted between runs so a restart resumes rather than restarts."""

    last_bar: Optional[str] = None
    cycles: int = 0
    bars_processed: int = 0
    trades_opened: int = 0
    trades_closed: int = 0
    halted: bool = False
    halt_reason: str = ""
    started_at: str = field(default_factory=lambda: utcnow().isoformat())
    position_meta: dict[str, dict] = field(default_factory=dict)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.__dict__, indent=2, default=str))

    @classmethod
    def load(cls, path: Path) -> "EngineState":
        if not path.exists():
            return cls()
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            return cls()
        state = cls()
        for key, value in data.items():
            if hasattr(state, key):
                setattr(state, key, value)
        return state


class TradingEngine:
    def __init__(
        self,
        config: BotConfig,
        feed: DataFeed,
        broker: Broker,
        ensemble: Ensemble,
        risk: RiskManager,
        journal: Journal,
        notifier: Notifier,
    ) -> None:
        self.config = config
        self.feed = feed
        self.broker = broker
        self.ensemble = ensemble
        self.risk = risk
        self.journal = journal
        self.notifier = notifier

        self.state_path = config.runtime.state_path("engine_state.json")
        self.state = EngineState.load(self.state_path)
        # Per-run counters restart; per-position state and the last bar seen
        # are what actually need to survive a restart.
        self.state.cycles = 0
        self.state.halted = False  # a restart clears a soft halt, deliberately
        self._run_opened = 0
        self._run_closed = 0
        self._run_bars = 0
        self._run_bars_in_market = 0
        self._stop = False
        self._pending_plan = None
        self._last_error: Optional[str] = None

    # ------------------------------------------------------------------
    def run(self) -> EngineState:
        self._install_signal_handlers()
        mode = "PAPER" if isinstance(self.broker, PaperBroker) else "LIVE"
        account = self.broker.account()
        log.info(
            "starting %s on %s %s | balance %.2f | %d strategies",
            mode,
            self.config.symbol,
            self.config.timeframe,
            account.balance,
            len(self.ensemble.strategies),
        )
        self.notifier.send(
            "start",
            f"GOLD BOT {mode}",
            f"{self.config.symbol} {self.config.timeframe} | balance {account.balance:,.2f}",
            tags="rocket",
        )
        self._adopt_existing_positions()

        try:
            while not self._stop:
                try:
                    self.cycle()
                    self._last_error = None
                except KeyboardInterrupt:
                    raise
                except Exception as exc:  # keep the loop alive, but loudly
                    log.exception("cycle failed")
                    self.journal.write("error", message=str(exc))
                    # Two consecutive failures of the same kind means the
                    # environment is broken, not the market: stop trading.
                    if self._last_error == str(exc):
                        self._halt(f"repeated failure: {exc}")
                    else:
                        self._last_error = str(exc)
                        self.notifier.error(str(exc))

                self.state.cycles += 1
                if (
                    self.config.runtime.max_cycles
                    and self.state.cycles >= self.config.runtime.max_cycles
                ):
                    log.info("max_cycles reached, stopping")
                    break
                if self.state.halted:
                    break
                if getattr(self.feed, "exhausted", False):
                    log.info("replay exhausted, stopping")
                    break
                # poll_seconds = 0 means "as fast as the feed allows" (replay).
                if self.config.runtime.poll_seconds > 0:
                    time.sleep(self.config.runtime.poll_seconds)
        except KeyboardInterrupt:
            log.info("interrupted — leaving open positions with their broker stops")
        finally:
            self._persist()
            self.broker.shutdown()
            self.feed.close()
        return self.state

    # ------------------------------------------------------------------
    def cycle(self) -> None:
        self.broker.sync()

        # Paper trading needs a price heartbeat to resolve its own stops.
        if isinstance(self.broker, PaperBroker):
            spread = self.feed.spread()
            if spread:
                self.broker.spread = spread
            price = self._latest_price()
            if price:
                for trade in self.broker.update_price(price, self._market_time()):
                    self._on_trade_closed(trade)

        df = self.feed.latest(self.config.timeframe, self.config.data.live_bars)
        if df is None or len(df) < 300:
            log.warning("only %s bars available, waiting", 0 if df is None else len(df))
            return

        bar_stamp = df.index[-1].isoformat()
        if bar_stamp == self.state.last_bar:
            self._manage_between_bars(df)
            return
        if self.state.last_bar and bar_stamp < self.state.last_bar:
            # Time went backwards: a replay, or a feed that was rewound. Treat
            # it as a fresh session rather than silently skipping every bar.
            log.info("feed rewound to %s — starting a new session", bar_stamp)
            self.state.position_meta.clear()

        self.state.last_bar = bar_stamp
        self.state.bars_processed += 1
        self._run_bars += 1
        self._on_new_bar(df)
        self._persist()

    # ------------------------------------------------------------------
    def _on_new_bar(self, df: pd.DataFrame) -> None:
        features = build_features(df, self.config.features)
        view = MarketView(df, features, len(df) - 1, self.config.symbol)
        moment = view.time
        account = self.broker.account()
        self.risk.sync(moment, account, self.state.bars_processed)

        positions = self._positions()
        spread = self._spread()
        price = self._latest_price() or view.close

        log.info(
            "bar %s close %.2f | %s | equity %.2f | %d open | spread %.2f",
            view.index,
            view.close,
            view.regime.value,
            account.equity,
            len(positions),
            spread,
        )
        self.journal.equity(account.balance, account.equity, len(positions))

        # 1. Hard exits first: weekend, kill switch, daily loss.
        if self._flatten_if_required(positions, moment, account):
            return

        # 2. Fill the plan decided on the previous bar, at this bar's opening
        #    price — the same sequencing the backtester used.
        if self._pending_plan is not None:
            plan = self._pending_plan
            self._pending_plan = None
            self._execute(plan, view)

        if self._positions():
            self._run_bars_in_market += 1

        # 3. Mark the bar's close. A real broker resolves stops and targets
        #    server-side; the paper broker needs the price to do it here.
        self._mark_to_close(view)

        # 4. Manage the survivors: trail, break-even, scale out, time stop.
        for position in self._positions():
            self._manage_position(position, view, view.close)

        # 5. Decide for the next bar.
        positions = self._positions()
        decision = self.ensemble.evaluate(view)
        if decision.direction is Direction.FLAT:
            log.info("decision: flat (%s)", decision.rejected or "no votes")
        elif decision.actionable:
            log.info("decision: %s", decision.describe())
        else:
            log.info("decision: %s — refused: %s", decision.describe(), decision.rejected)

        if decision.actionable:
            self._close_on_flip(positions, decision, price)
            positions = self._positions()

        # Size against the equity as it stands now, after this bar's fills and
        # exits — not the snapshot taken at the top of the bar.
        account = self.broker.account()
        plan, why = self.risk.build_plan(
            decision, view, account, positions, self.state.bars_processed, spread
        )
        self.journal.decision(decision, taken=plan is not None, why=why)
        if plan is not None:
            # Decide now, execute on the next bar's open — exactly as backtested.
            self._pending_plan = plan
            log.info(
                "planned %s %.2f lots, entry ~%.2f stop %.2f target %s (%s)",
                plan.side.value,
                plan.lots,
                plan.entry,
                plan.stop_loss,
                f"{plan.take_profit:.2f}" if plan.take_profit else "trail",
                plan.comment,
            )
        elif why not in {"no_signal", "no_votes", ""}:
            log.debug("no trade: %s", why)

        self.ensemble.adaptive.save(
            self.config.runtime.state_path(self.config.runtime.weights_file)
        )

    def _mark_to_close(self, view: MarketView) -> None:
        if not isinstance(self.broker, PaperBroker):
            return
        for trade in self.broker.update_price(view.close, view.time):
            self._on_trade_closed(trade)

    def _manage_between_bars(self, df: pd.DataFrame) -> None:
        """Between bar closes only two things matter: a broker-side stop that
        already fired, and a hard flatten condition."""
        positions = self._positions()
        if not positions:
            return
        account = self.broker.account()
        moment = utcnow()
        self._flatten_if_required(positions, moment, account)

    # ------------------------------------------------------------------
    def _manage_position(self, position: Position, view: MarketView, price: float) -> None:
        position.bars_held += 1
        self._remember(position, bars_held=position.bars_held)

        new_stop, actions = manage_position(position, view, self.risk.stops, price)

        for reason, fraction in actions:
            if reason is ExitReason.PARTIAL_TP:
                if position.partial_done or fraction <= 0:
                    continue
                trade = self.broker.close(position, fraction, reason)
                if trade:
                    position.partial_done = True
                    self._remember(position, partial_done=True)
                    self._on_trade_closed(trade)
            else:
                trade = self.broker.close(position, 1.0, reason)
                if trade:
                    self._on_trade_closed(trade)
                return

        if new_stop is not None:
            if self.broker.modify(position, stop_loss=new_stop):
                moved_to_be = (
                    new_stop >= position.entry_price
                    if position.side is Side.BUY
                    else new_stop <= position.entry_price
                )
                position.breakeven_done = position.breakeven_done or moved_to_be
                self._remember(
                    position,
                    last_stop=new_stop,
                    breakeven_done=position.breakeven_done,
                )
                log.info(
                    "ticket %s stop → %.2f (%s)",
                    position.ticket,
                    new_stop,
                    "break-even" if moved_to_be else "trailing",
                )

    def _execute(self, plan, view: MarketView) -> None:
        account = self.broker.account()
        positions = self._positions()
        spread = self._spread()

        # Re-check the gates: the market moved while we waited for the bar.
        allowed, why = self.risk.can_open(
            view.time, account, positions, self.state.bars_processed, spread
        )
        if not allowed:
            log.info("skipping planned entry: %s", why)
            self.journal.write("entry_skipped", reason=why, side=plan.side.value)
            return

        tick = self.broker.tick()
        market = tick.ask if plan.side is Side.BUY else tick.bid
        drift = (market - plan.entry) * plan.side.sign
        if drift > self.config.backtest.max_entry_slip_r * plan.stop_distance:
            log.info("skipping planned entry: price ran %.2f past the level", drift)
            self.journal.write("entry_skipped", reason="price_moved", drift=round(drift, 2))
            return

        # The market must still be on the correct side of the stop, or the
        # trade would open already beaten.
        beyond_stop = (
            market <= plan.stop_loss
            if plan.side is Side.BUY
            else market >= plan.stop_loss
        )
        if beyond_stop:
            log.info(
                "skipping planned entry: %.2f is already through the stop at %.2f",
                market,
                plan.stop_loss,
            )
            self.journal.write("entry_skipped", reason="through_stop", price=round(market, 2))
            return

        # Re-size on the distance actually available, so a move between the
        # decision and the fill changes the size, never the risk.
        actual_distance = abs(market - plan.stop_loss)
        if actual_distance > 1.5 * plan.stop_distance:
            log.info("skipping planned entry: stop distance widened to %.2f", actual_distance)
            self.journal.write("entry_skipped", reason="stop_widened")
            return
        resized = round_lots(
            plan.risk_amount / (actual_distance * CONTRACT_SIZE),
            self.risk.config.lot_step,
            self.risk.config.min_lots,
        )
        if resized <= 0:
            self.journal.write("entry_skipped", reason="size_below_minimum")
            return
        if abs(resized - plan.lots) >= self.risk.config.lot_step:
            log.info("resized %.2f → %.2f lots for the actual fill distance", plan.lots, resized)
        plan.lots = resized
        plan.entry = market

        position = self.broker.open(plan)
        if position is None:
            log.warning("broker did not open the position")
            self.journal.write("entry_failed", side=plan.side.value, lots=plan.lots)
            return

        self.risk.on_trade_opened()
        self.state.trades_opened += 1
        self._run_opened += 1
        self._remember(
            position,
            initial_lots=position.initial_lots,
            initial_stop=position.initial_stop,
            contributors=plan.contributors,
            confidence=plan.confidence,
            regime=plan.regime.value,
            bars_held=0,
        )
        self.journal.entry(position, plan)
        self.notifier.entry(
            position.side.value,
            position.lots,
            position.entry_price,
            position.stop_loss,
            position.take_profit,
            plan.confidence,
        )
        log.info(
            "OPENED %s %.2f lots @ %.2f | stop %.2f | risk %.2f",
            position.side.value,
            position.lots,
            position.entry_price,
            position.stop_loss,
            plan.risk_amount,
        )

    def _close_on_flip(self, positions: list[Position], decision, price: float) -> None:
        stops = self.risk.stops
        if not stops.exit_on_flip or decision.confidence < stops.flip_confidence:
            return
        wanted = Side.BUY if decision.direction is Direction.LONG else Side.SELL
        for position in positions:
            if position.side is wanted:
                continue
            trade = self.broker.close(position, 1.0, ExitReason.SIGNAL_FLIP)
            if trade:
                log.info("closed ticket %s on signal flip", position.ticket)
                self._on_trade_closed(trade)

    def _flatten_if_required(
        self, positions: list[Position], moment: datetime, account: AccountState
    ) -> bool:
        reason: Optional[ExitReason] = None
        label = ""

        if self.risk.state.halted:
            reason, label = ExitReason.KILL_SWITCH, self.risk.state.halt_reason
        else:
            flat, why = self.risk.sessions.must_flatten(moment)
            if flat:
                reason, label = ExitReason.SESSION_END, why
            elif self.risk.daily_pnl_pct() <= -self.risk.config.max_daily_loss:
                reason, label = ExitReason.DAILY_LOSS_LIMIT, "daily loss limit"

        if reason is None:
            return False

        if positions:
            log.warning("flattening %d position(s): %s", len(positions), label)
            for trade in self.broker.close_all(reason):
                self._on_trade_closed(trade)
        self._pending_plan = None

        if reason is ExitReason.KILL_SWITCH:
            self._halt(label or "risk kill switch")
        elif reason is ExitReason.DAILY_LOSS_LIMIT:
            self.notifier.send(
                "halt",
                "GOLD daily loss limit",
                f"{label} — no more trades today. Equity {account.equity:,.2f}",
                priority="high",
                tags="octagonal_sign",
            )
        return True

    # ------------------------------------------------------------------
    def _on_trade_closed(self, trade: Trade) -> None:
        self.state.trades_closed += 1
        self._run_closed += 1
        self.risk.register_close(trade.pnl, self.state.bars_processed)
        self.ensemble.on_trade_closed(trade.contributors, trade.r_multiple)
        self.journal.exit(trade)
        self.notifier.exit(
            trade.side.value,
            trade.lots,
            trade.exit_price,
            trade.pnl,
            trade.r_multiple,
            trade.exit_reason.value,
        )
        log.info(
            "CLOSED %s %.2f lots @ %.2f | %+.2f (%+.2fR) | %s",
            trade.side.value,
            trade.lots,
            trade.exit_price,
            trade.pnl,
            trade.r_multiple,
            trade.exit_reason.value,
        )
        if trade.exit_reason is ExitReason.STOP_LOSS:
            self.state.position_meta.pop(str(trade.ticket), None)

    def _halt(self, reason: str) -> None:
        self.state.halted = True
        self.state.halt_reason = reason
        self.risk.state.halted = True
        self.risk.state.halt_reason = reason
        equity = 0.0
        try:
            equity = self.broker.account().equity
        except Exception:
            pass
        log.error("HALTED: %s", reason)
        self.journal.write("halt", reason=reason, equity=equity)
        self.notifier.halt(reason, equity)
        self._persist()

    # ------------------------------------------------------------------
    def _positions(self) -> list[Position]:
        positions = self.broker.positions()
        for position in positions:
            meta = self.state.position_meta.get(str(position.ticket))
            if not meta:
                continue
            position.initial_lots = float(meta.get("initial_lots", position.initial_lots))
            position.initial_stop = float(meta.get("initial_stop", position.initial_stop))
            position.partial_done = bool(meta.get("partial_done", position.partial_done))
            position.breakeven_done = bool(meta.get("breakeven_done", position.breakeven_done))
            position.bars_held = int(meta.get("bars_held", position.bars_held))
            position.contributors = dict(meta.get("contributors", position.contributors))
            position.meta.update(meta)
        return positions

    def _remember(self, position: Position, **fields) -> None:
        record = self.state.position_meta.setdefault(str(position.ticket), {})
        record.update(fields)
        remember = getattr(self.broker, "remember", None)
        if callable(remember):
            remember(position.ticket, **fields)

    def _adopt_existing_positions(self) -> None:
        """Re-attach to positions that survived a restart, and refuse to manage
        anything this bot did not open."""
        positions = self._positions()
        if not positions:
            return
        log.warning("adopting %d existing position(s)", len(positions))
        for position in positions:
            if not position.stop_loss:
                log.error(
                    "ticket %s has no stop loss — set one manually; the bot will not size around it",
                    position.ticket,
                )
                self.notifier.error(
                    f"position {position.ticket} has no stop loss attached"
                )
            self._remember(
                position,
                initial_lots=position.initial_lots or position.lots,
                initial_stop=position.initial_stop or position.stop_loss,
            )
            self.journal.write(
                "adopted",
                ticket=position.ticket,
                side=position.side.value,
                lots=position.lots,
                stop=position.stop_loss,
            )

    def _market_time(self) -> datetime:
        """Wall clock live; the replay's own clock when replaying, so trade
        timestamps and the equity curve stay on market time."""
        current = getattr(self.feed, "current_time", None)
        if callable(current):
            moment = current()
            if moment is not None:
                return as_utc(moment)
        return utcnow()

    def _feed_price(self) -> Optional[float]:
        """Price straight from the market data, independent of the broker."""
        current = getattr(self.feed, "current_price", None)
        if callable(current):
            price = current()
            if price:
                return float(price)
        try:
            df = self.feed.history(self.config.timeframe, 2)
            return float(df["close"].iloc[-1])
        except Exception:
            return None

    def _latest_price(self) -> Optional[float]:
        """The paper broker's quote is whatever we last fed it, so asking it
        for a price would just echo our own stale value back."""
        if isinstance(self.broker, PaperBroker):
            return self._feed_price()
        try:
            tick = self.broker.tick()
            if tick.bid > 0 and tick.ask > 0:
                return tick.mid
        except Exception:
            pass
        return self._feed_price()

    def _spread(self) -> float:
        try:
            tick = self.broker.tick()
            if tick.spread > 0:
                return tick.spread
        except Exception:
            pass
        return self.feed.spread() or self.config.costs.base_spread

    def _persist(self) -> None:
        try:
            self.state.save(self.state_path)
            self.ensemble.adaptive.save(
                self.config.runtime.state_path(self.config.runtime.weights_file)
            )
        except OSError as exc:
            log.warning("could not persist state: %s", exc)

    def _install_signal_handlers(self) -> None:
        def handler(signum, _frame):
            log.info("signal %s received — finishing this cycle and stopping", signum)
            self._stop = True

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, handler)
            except (ValueError, OSError):  # not the main thread
                pass
