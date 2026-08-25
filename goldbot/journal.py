"""Trade journal and run log.

Two files, both append-only:

* ``journal.jsonl`` — one JSON object per event (decision, entry, exit, halt).
  Append-only means a crash cannot corrupt earlier history, and JSONL means the
  whole file is analysable with pandas in one line.
* ``equity.csv`` — an equity sample per cycle, for charting the live curve.

Every entry records which strategies drove it, so after a hundred trades the
question "which of these actually works on my account?" has a data answer.
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from .core.types import Position, Trade, TradePlan, utcnow


def _encode(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _encode(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _encode(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_encode(v) for v in value]
    if hasattr(value, "value"):  # Enum
        return value.value
    return value


class Journal:
    def __init__(self, path: str | Path, equity_path: Optional[str | Path] = None):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.equity_path = Path(equity_path).expanduser() if equity_path else None
        if self.equity_path and not self.equity_path.exists():
            self.equity_path.parent.mkdir(parents=True, exist_ok=True)
            self.equity_path.write_text("time,balance,equity,open_positions\n")

    def write(self, event: str, **payload) -> None:
        record = {"time": utcnow().isoformat(), "event": event, **_encode(payload)}
        with self.path.open("a") as handle:
            handle.write(json.dumps(record, default=str) + "\n")

    def entry(self, position: Position, plan: TradePlan) -> None:
        self.write(
            "entry",
            ticket=position.ticket,
            side=position.side.value,
            lots=position.lots,
            entry=position.entry_price,
            stop=position.stop_loss,
            target=position.take_profit,
            risk_amount=round(plan.risk_amount, 2),
            reward_risk=round(plan.reward_risk or 0.0, 2),
            confidence=round(plan.confidence, 3),
            regime=plan.regime.value,
            contributors=plan.contributors,
            comment=plan.comment,
        )

    def exit(self, trade: Trade) -> None:
        self.write("exit", **trade.to_row())

    def decision(self, decision, taken: bool, why: str = "") -> None:
        self.write(
            "decision",
            direction=decision.direction.name,
            confidence=round(decision.confidence, 3),
            agreement=round(decision.agreement, 3),
            participation=round(decision.participation, 3),
            regime=decision.regime.value,
            taken=taken,
            why=why or decision.rejected,
            contributors=decision.contributors,
        )

    def equity(self, balance: float, equity: float, open_positions: int) -> None:
        if not self.equity_path:
            return
        with self.equity_path.open("a") as handle:
            handle.write(
                f"{utcnow().isoformat()},{balance:.2f},{equity:.2f},{open_positions}\n"
            )

    # -- analysis ---------------------------------------------------------
    def read(self, event: Optional[str] = None) -> pd.DataFrame:
        if not self.path.exists():
            return pd.DataFrame()
        rows = []
        for line in self.path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event is None or record.get("event") == event:
                rows.append(record)
        return pd.DataFrame(rows)

    def strategy_attribution(self) -> pd.DataFrame:
        """P&L credited to each strategy, in proportion to its vote.

        This is the report that tells you which parts of the committee are
        earning their seat.
        """
        exits = self.read("exit")
        if exits.empty or "contributors" not in exits.columns:
            return pd.DataFrame()
        rows: list[dict] = []
        for _, record in exits.iterrows():
            contributors = record.get("contributors") or {}
            if not isinstance(contributors, dict) or not contributors:
                continue
            total = sum(abs(v) for v in contributors.values()) or 1.0
            for name, weight in contributors.items():
                share = abs(weight) / total
                rows.append(
                    {
                        "strategy": name,
                        "pnl": float(record.get("pnl", 0.0)) * share,
                        "r": float(record.get("r", 0.0)) * share,
                        "trades": share,
                    }
                )
        if not rows:
            return pd.DataFrame()
        frame = pd.DataFrame(rows).groupby("strategy").sum()
        frame["expectancy_r"] = frame["r"] / frame["trades"].replace(0.0, 1.0)
        return frame.sort_values("pnl", ascending=False).round(3)
