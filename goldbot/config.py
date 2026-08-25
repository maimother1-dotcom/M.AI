"""Configuration.

One YAML file drives everything. Secrets are never read from it: any string of
the form ``${ENV_VAR}`` is resolved from the environment (or from
``~/.claude/credentials/goldbot.env``), so the config file itself stays safe to
commit and to share.
"""

from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, Optional

import yaml

from .backtest.engine import BacktestConfig, CostModel
from .core.features import FeatureConfig
from .risk.manager import RiskConfig
from .risk.sessions import EconomicCalendar, SessionPolicy
from .risk.stops import StopConfig
from .strategies import DEFAULT_WEIGHTS
from .strategies.ensemble import EnsembleConfig

ENV_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
CREDENTIALS_FILE = Path.home() / ".claude" / "credentials" / "goldbot.env"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "default_config.yaml"


def load_credentials(path: Path = CREDENTIALS_FILE) -> None:
    """Load KEY=VALUE lines into the environment without overwriting it."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def expand(value: Any) -> Any:
    """Resolve ${VAR} references recursively. Unset variables become None."""
    if isinstance(value, str):
        match = ENV_PATTERN.fullmatch(value.strip())
        if match:
            return os.environ.get(match.group(1))
        return ENV_PATTERN.sub(lambda m: os.environ.get(m.group(1), ""), value)
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    if isinstance(value, list):
        return [expand(v) for v in value]
    return value


@dataclass
class DataConfig:
    #: synthetic | csv | mt5 | oanda
    source: str = "synthetic"
    csv_path: Optional[str] = None
    history_bars: int = 20_000
    #: Bars pulled on each live cycle — enough for the 200-EMA and the D1 features.
    live_bars: int = 1500
    synthetic_seed: int = 42


@dataclass
class MT5Config:
    login: Optional[int] = None
    password: Optional[str] = None
    server: Optional[str] = None
    terminal_path: Optional[str] = None
    symbol: str = "XAUUSD"
    deviation_points: int = 20
    magic: int = 20260825


@dataclass
class OandaConfig:
    token: Optional[str] = None
    account_id: Optional[str] = None
    environment: str = "practice"
    symbol: str = "XAU_USD"


@dataclass
class RuntimeConfig:
    #: How often the live loop wakes to check for a newly closed bar.
    poll_seconds: int = 20
    state_dir: str = "~/.goldbot"
    journal_file: str = "journal.jsonl"
    equity_file: str = "equity.csv"
    weights_file: str = "adaptive_weights.json"
    log_level: str = "INFO"
    log_file: Optional[str] = "goldbot.log"
    ntfy_topic: Optional[str] = None
    notify_on: tuple[str, ...] = ("entry", "exit", "halt", "error")
    #: Paper mode routes decisions to the simulated broker with live prices.
    dry_run: bool = True
    #: Refuse to start live unless this is explicitly set to True.
    confirm_live: bool = False
    max_cycles: int = 0  # 0 = run forever

    def state_path(self, name: str) -> Path:
        base = Path(self.state_dir).expanduser()
        base.mkdir(parents=True, exist_ok=True)
        return base / name


@dataclass
class StrategyConfig:
    enabled: Optional[list[str]] = None
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    params: dict[str, dict] = field(default_factory=dict)


@dataclass
class BotConfig:
    symbol: str = "XAUUSD"
    timeframe: str = "M15"
    broker: str = "paper"  # paper | mt5 | oanda
    initial_balance: float = 10_000.0
    data: DataConfig = field(default_factory=DataConfig)
    mt5: MT5Config = field(default_factory=MT5Config)
    oanda: OandaConfig = field(default_factory=OandaConfig)
    features: FeatureConfig = field(default_factory=FeatureConfig)
    ensemble: EnsembleConfig = field(default_factory=EnsembleConfig)
    strategies: StrategyConfig = field(default_factory=StrategyConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    stops: StopConfig = field(default_factory=StopConfig)
    costs: CostModel = field(default_factory=CostModel)
    backtest: BacktestConfig = field(default_factory=BacktestConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)
    sessions: list[str] = field(default_factory=lambda: ["london", "new_york"])
    news_blackout_minutes_before: int = 15
    news_blackout_minutes_after: int = 30
    news_events: list[str] = field(default_factory=list)
    include_nfp_blackout: bool = True
    friday_cutoff_hour: int = 19

    # -- derived helpers --------------------------------------------------
    def session_policy(self) -> SessionPolicy:
        calendar = EconomicCalendar(
            blackout_minutes_before=self.news_blackout_minutes_before,
            blackout_minutes_after=self.news_blackout_minutes_after,
            include_nfp=self.include_nfp_blackout,
        )
        for event in self.news_events:
            try:
                calendar.add_event(event)
            except ValueError:
                continue
        return SessionPolicy(
            allowed_sessions=tuple(self.sessions),
            friday_cutoff_hour=self.friday_cutoff_hour,
            calendar=calendar,
        )

    def validate(self) -> list[str]:
        """Return a list of problems. Empty means the config is coherent."""
        problems: list[str] = []
        if self.risk.risk_per_trade <= 0 or self.risk.risk_per_trade > 0.05:
            problems.append(
                f"risk.risk_per_trade {self.risk.risk_per_trade:.3f} is outside the sane 0-5% band"
            )
        if self.risk.max_daily_loss <= self.risk.risk_per_trade:
            problems.append("risk.max_daily_loss must exceed the per-trade risk")
        if self.risk.max_drawdown <= self.risk.max_daily_loss:
            problems.append("risk.max_drawdown should be larger than max_daily_loss")
        if self.stops.min_atr_mult > self.stops.atr_mult:
            problems.append("stops.min_atr_mult cannot exceed stops.atr_mult")
        if self.stops.take_profit_r <= self.stops.partial_at_r:
            problems.append("stops.take_profit_r must be beyond stops.partial_at_r")
        if self.broker == "mt5" and not self.runtime.dry_run and not self.mt5.login:
            problems.append("mt5.login is required for live MT5 trading")
        if self.broker == "oanda" and not self.oanda.token:
            problems.append("oanda.token is unset (use ${OANDA_TOKEN})")
        if self.broker not in {"paper", "mt5", "oanda"}:
            problems.append(f"unknown broker {self.broker!r}")
        unknown = set(self.strategies.weights) - set(DEFAULT_WEIGHTS)
        if unknown:
            problems.append(f"weights reference unknown strategies: {sorted(unknown)}")
        if not self.runtime.dry_run and not self.runtime.confirm_live:
            problems.append(
                "live trading requires runtime.confirm_live: true — set it deliberately"
            )
        return problems

    # -- serialisation ----------------------------------------------------
    def to_dict(self) -> dict:
        def clean(value):
            if is_dataclass(value):
                return {k: clean(v) for k, v in asdict(value).items()}
            if isinstance(value, dict):
                return {k: clean(v) for k, v in value.items()}
            if isinstance(value, (list, tuple)):
                return [clean(v) for v in value]
            return value

        data = clean(self)
        # Never write secrets back out.
        for section, keys in (("mt5", ("password",)), ("oanda", ("token",))):
            for key in keys:
                if data.get(section, {}).get(key):
                    data[section][key] = f"${{{section.upper()}_{key.upper()}}}"
        return data

    def save(self, path: str | Path) -> Path:
        out = Path(path).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(yaml.safe_dump(self.to_dict(), sort_keys=False, width=100))
        return out


def _build(cls, data: Optional[dict]):
    """Instantiate a dataclass from a dict, ignoring unknown keys loudly."""
    if not data:
        return cls()
    known = {f.name for f in fields(cls)}
    unknown = set(data) - known
    if unknown:
        raise ValueError(f"{cls.__name__}: unknown settings {sorted(unknown)}")
    payload = {k: v for k, v in data.items() if k in known and v is not None}
    defaults = cls()
    for f in fields(cls):
        if f.name in payload and isinstance(getattr(defaults, f.name, None), tuple):
            payload[f.name] = tuple(payload[f.name])
    return cls(**payload)


def load(path: Optional[str | Path] = None) -> BotConfig:
    load_credentials()
    file = Path(path).expanduser() if path else DEFAULT_CONFIG_PATH
    if not file.exists():
        if path:
            raise FileNotFoundError(file)
        return BotConfig()

    raw = yaml.safe_load(file.read_text()) or {}
    raw = expand(raw)

    strategies = raw.get("strategies") or {}
    config = BotConfig(
        symbol=raw.get("symbol", "XAUUSD"),
        timeframe=raw.get("timeframe", "M15"),
        broker=raw.get("broker", "paper"),
        initial_balance=float(raw.get("initial_balance", 10_000.0)),
        data=_build(DataConfig, raw.get("data")),
        mt5=_build(MT5Config, raw.get("mt5")),
        oanda=_build(OandaConfig, raw.get("oanda")),
        features=_build(FeatureConfig, raw.get("features")),
        ensemble=_build(EnsembleConfig, raw.get("ensemble")),
        strategies=StrategyConfig(
            enabled=strategies.get("enabled"),
            weights={**DEFAULT_WEIGHTS, **(strategies.get("weights") or {})},
            params=strategies.get("params") or {},
        ),
        risk=_build(RiskConfig, raw.get("risk")),
        stops=_build(StopConfig, raw.get("stops")),
        costs=_build(CostModel, raw.get("costs")),
        backtest=_build(BacktestConfig, raw.get("backtest")),
        runtime=_build(RuntimeConfig, raw.get("runtime")),
        sessions=raw.get("sessions", ["london", "new_york"]),
        news_blackout_minutes_before=raw.get("news_blackout_minutes_before", 15),
        news_blackout_minutes_after=raw.get("news_blackout_minutes_after", 30),
        news_events=raw.get("news_events", []) or [],
        include_nfp_blackout=raw.get("include_nfp_blackout", True),
        friday_cutoff_hour=raw.get("friday_cutoff_hour", 19),
    )
    config.backtest.costs = config.costs
    config.backtest.initial_balance = config.initial_balance
    return config
