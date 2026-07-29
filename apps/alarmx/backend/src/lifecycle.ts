/**
 * Moving a user through days. PRD 18.4.
 *
 * Every value here comes from server time and the user's **pinned** UTC offset.
 * The device clock is never an input, which is why changing the phone timezone
 * cannot manufacture earning days.
 */
import { DayBoundary } from './integrity';
import { UserRecord } from './store';

export interface RollResult {
  readonly user: UserRecord;
  /** True when the day counter actually advanced. */
  readonly rolled: boolean;
  /** True when a rollover was due but refused as implausibly fast. */
  readonly refused: boolean;
}

/**
 * Advance the user's day if server time says a new one has begun.
 *
 * The daily view ceiling and the alarm gate both key off `currentDayIndex`, so
 * this is the function that decides when 20 more credited views become
 * available. It refuses to advance faster than `MIN_DAY_GAP_MS`, which is what
 * stops a timezone change from handing out a second day's ceiling in an
 * afternoon.
 */
export function rollForward(user: UserRecord, boundary: DayBoundary, nowMs: number): RollResult {
  const today = boundary.dayIndex(nowMs);
  if (today <= user.currentDayIndex) return { user, rolled: false, refused: false };

  if (!boundary.mayRollOver(user.lastDayStartMs, nowMs)) {
    return { user, rolled: false, refused: true };
  }

  return {
    user: {
      ...user,
      currentDayIndex: today,
      lastDayStartMs: nowMs,
      creditedViewsToday: 0,
    },
    rolled: true,
    refused: false,
  };
}

export interface AlarmResult {
  readonly user: UserRecord;
  /** False when the alarm for this day was already recorded. */
  readonly firstToday: boolean;
}

/**
 * Record that the user completed an alarm today.
 *
 * This is an **event**, not an amount. The client sends no money, no tier and
 * no day index; all three are derived here. Completing the alarm is what
 * unlocks earning for the day (PRD 4.7), so it is also what advances the
 * streak that sets the share tier.
 */
export function completeAlarm(user: UserRecord, dayIndex: number): AlarmResult {
  if (user.alarmCompletedForDay === dayIndex) {
    return { user, firstToday: false };
  }
  // Consecutive means literally the day before. Anything else starts at 1
  // rather than continuing, so a gap costs the tier.
  const continues = user.alarmCompletedForDay === dayIndex - 1;
  return {
    user: {
      ...user,
      alarmCompletedForDay: dayIndex,
      streakDays: continues ? user.streakDays + 1 : 1,
      distinctAlarmDays: user.distinctAlarmDays + 1,
    },
    firstToday: true,
  };
}
