"""Notifications.

Push goes over ntfy (the topic this machine already uses), and everything is
best-effort: a notification failure must never interrupt trading, so every
send is wrapped and logged rather than raised.

ntfy topics are public to anyone who knows the name, so messages carry
position sizes and prices but never account numbers or credentials.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Optional

log = logging.getLogger("goldbot.notify")

NTFY_URL = "https://ntfy.sh"


class Notifier:
    def __init__(
        self,
        topic: Optional[str] = None,
        enabled_events: tuple[str, ...] = ("entry", "exit", "halt", "error"),
        server: str = NTFY_URL,
        timeout: int = 8,
    ) -> None:
        self.topic = topic
        self.enabled = set(enabled_events)
        self.server = server.rstrip("/")
        self.timeout = timeout

    def send(
        self,
        event: str,
        title: str,
        message: str,
        priority: str = "default",
        tags: str = "chart_with_upwards_trend",
    ) -> bool:
        log.info("[%s] %s — %s", event, title, message)
        if not self.topic or event not in self.enabled:
            return False
        try:
            request = urllib.request.Request(
                f"{self.server}/{self.topic}",
                data=message.encode("utf-8"),
                method="POST",
            )
            request.add_header("Title", title[:200])
            request.add_header("Priority", priority)
            request.add_header("Tags", tags)
            with urllib.request.urlopen(request, timeout=self.timeout):
                return True
        except (urllib.error.URLError, OSError, ValueError) as exc:
            log.warning("notification failed: %s", exc)
            return False

    def entry(self, side: str, lots: float, price: float, stop: float, target, confidence: float) -> None:
        self.send(
            "entry",
            f"GOLD {side} {lots:.2f} lots @ {price:.2f}",
            f"stop {stop:.2f} | target {target if target is None else f'{target:.2f}'} "
            f"| confidence {confidence:.0%}",
            tags="moneybag",
        )

    def exit(self, side: str, lots: float, price: float, pnl: float, r: float, reason: str) -> None:
        self.send(
            "exit",
            f"GOLD {side} closed @ {price:.2f}  {pnl:+,.2f}",
            f"{lots:.2f} lots | {r:+.2f}R | {reason}",
            priority="default" if pnl >= 0 else "high",
            tags="white_check_mark" if pnl >= 0 else "x",
        )

    def halt(self, reason: str, equity: float) -> None:
        self.send(
            "halt",
            "GOLD BOT HALTED",
            f"{reason}\nequity {equity:,.2f} — trading stopped, no new positions",
            priority="urgent",
            tags="rotating_light",
        )

    def error(self, message: str) -> None:
        self.send("error", "GOLD BOT ERROR", message[:500], priority="high", tags="warning")

    def heartbeat(self, payload: dict) -> None:
        self.send(
            "heartbeat",
            "GOLD BOT",
            json.dumps(payload, default=str)[:500],
            tags="green_circle",
        )
