"""Trading sessions and the economic-calendar blackout.

Gold's character changes completely by session: the Asian range is thin and
mean-reverting, London brings the first real expansion, and the New York
overlap carries the day's volume and the US data releases. Several strategies
key off these windows, and the risk layer refuses to trade outside them.

All times are UTC. Broker-server time is never used for decisions — brokers
disagree about it, UTC does not.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from ..core.types import as_utc


@dataclass(frozen=True)
class Session:
    name: str
    start: time
    end: time

    def contains(self, moment: datetime) -> bool:
        t = as_utc(moment).timetz().replace(tzinfo=None)
        if self.start <= self.end:
            return self.start <= t < self.end
        # Wraps midnight (Sydney/Asia).
        return t >= self.start or t < self.end


# Canonical windows in UTC (winter reference; the overlap is what matters and
# it stays inside these bounds across DST shifts).
SYDNEY = Session("sydney", time(21, 0), time(6, 0))
TOKYO = Session("tokyo", time(0, 0), time(8, 0))
LONDON = Session("london", time(7, 0), time(16, 0))
NEW_YORK = Session("new_york", time(12, 0), time(21, 0))
LONDON_NY_OVERLAP = Session("overlap", time(12, 0), time(16, 0))
ASIAN_RANGE = Session("asian_range", time(23, 0), time(6, 0))

SESSIONS: dict[str, Session] = {
    s.name: s
    for s in (SYDNEY, TOKYO, LONDON, NEW_YORK, LONDON_NY_OVERLAP, ASIAN_RANGE)
}


def active_sessions(moment: datetime) -> list[str]:
    return [name for name, s in SESSIONS.items() if s.contains(moment)]


def in_any_session(moment: datetime, names: Iterable[str]) -> bool:
    for name in names:
        session = SESSIONS.get(name)
        if session and session.contains(moment):
            return True
    return False


def session_key(moment: datetime) -> str:
    """Stable key for the current trading day, rolled at 21:00 UTC (the FX
    day boundary) so an evening session groups with the day it belongs to."""
    m = as_utc(moment)
    day = m.date() + timedelta(days=1) if m.hour >= 21 else m.date()
    return day.isoformat()


# --------------------------------------------------------------------------
# Economic calendar
# --------------------------------------------------------------------------


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """n-th `weekday` of a month (Monday=0). n=1 is the first."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def nfp_datetime(year: int, month: int) -> datetime:
    """US Non-Farm Payrolls: first Friday, 13:30 UTC (12:30 during US DST is
    handled by the ±window, which is wide enough to cover both)."""
    day = nth_weekday(year, month, calendar.FRIDAY, 1)
    return datetime.combine(day, time(13, 30), tzinfo=timezone.utc)


@dataclass
class EconomicCalendar:
    """High-impact events the bot must stand aside for.

    Recurring events (NFP) are derived. One-off events (FOMC, CPI dates) come
    from config as ISO timestamps, so no network call is needed at runtime —
    a bot that silently fails open when a calendar API is down is worse than
    one that only knows what it was told.
    """

    blackout_minutes_before: int = 15
    blackout_minutes_after: int = 30
    include_nfp: bool = True
    events: list[datetime] = field(default_factory=list)

    def add_event(self, moment: datetime | str) -> None:
        if isinstance(moment, str):
            moment = datetime.fromisoformat(moment)
        self.events.append(as_utc(moment))

    def is_blackout(self, moment: datetime) -> tuple[bool, str]:
        m = as_utc(moment)
        before = timedelta(minutes=self.blackout_minutes_before)
        after = timedelta(minutes=self.blackout_minutes_after)

        if self.include_nfp:
            nfp = nfp_datetime(m.year, m.month)
            if nfp - before <= m <= nfp + after:
                return True, "NFP"

        for event in self.events:
            if event - before <= m <= event + after:
                return True, f"event@{event.isoformat()}"
        return False, ""


@dataclass
class SessionPolicy:
    """When the bot is allowed to be in the market at all."""

    allowed_sessions: tuple[str, ...] = ("london", "new_york")
    trade_monday_open: bool = False
    friday_cutoff_hour: int = 19  # UTC; flat before the weekend gap
    sunday_open_hour: int = 22
    monday_warmup_hours: int = 1
    calendar: Optional[EconomicCalendar] = None

    def can_trade(self, moment: datetime) -> tuple[bool, str]:
        m = as_utc(moment)
        weekday = m.weekday()

        if weekday == 5:  # Saturday
            return False, "weekend"
        if weekday == 6 and m.hour < self.sunday_open_hour:
            return False, "market_closed"
        if weekday == 4 and m.hour >= self.friday_cutoff_hour:
            return False, "friday_cutoff"
        if (
            weekday == 0
            and not self.trade_monday_open
            and m.hour < self.monday_warmup_hours
        ):
            return False, "monday_warmup"
        # The daily rollover window: spreads blow out, fills are unreliable.
        if m.hour == 21 and m.minute < 15:
            return False, "rollover"
        if self.allowed_sessions and not in_any_session(m, self.allowed_sessions):
            return False, "outside_session"
        if self.calendar is not None:
            blackout, label = self.calendar.is_blackout(m)
            if blackout:
                return False, f"news:{label}"
        return True, "ok"

    def must_flatten(self, moment: datetime) -> tuple[bool, str]:
        """Hard flat-out conditions, checked even while a position is open."""
        m = as_utc(moment)
        if m.weekday() == 4 and m.hour >= self.friday_cutoff_hour + 1:
            return True, "friday_flat"
        if m.weekday() == 5:
            return True, "weekend_flat"
        return False, ""
