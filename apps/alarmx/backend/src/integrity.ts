/**
 * The controls that stop the product being farmed. PRD 18.4, 18.6, 18.7.
 *
 * Everything here takes **server** time and server-held state. No device clock,
 * no client-supplied identity, no client-supplied amount.
 */
import { Paise, subtract } from './money';

/* ------------------------------------------------------------------ day boundary */

export const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 20 hours, not 24, on purpose: an 8am Monday alarm followed by a 7am Tuesday
 * alarm is 23 hours apart and is a genuine second day (PRD 7.4). Anything
 * faster than 20 hours is a clock being manipulated, because two real local
 * midnights cannot be closer than that.
 */
export const MIN_DAY_GAP_MS = 20 * 60 * 60 * 1000;

export const TIMEZONE_CHANGE_COOLDOWN_DAYS = 14;

export class DayBoundary {
  constructor(readonly pinnedUtcOffsetMinutes: number) {
    if (!Number.isInteger(pinnedUtcOffsetMinutes) ||
        pinnedUtcOffsetMinutes < -12 * 60 || pinnedUtcOffsetMinutes > 14 * 60) {
      throw new RangeError(`implausible timezone offset: ${pinnedUtcOffsetMinutes}`);
    }
  }

  /** Whole days since the epoch in the user's *pinned* zone. */
  dayIndex(serverEpochMs: number): number {
    return Math.floor((serverEpochMs + this.pinnedUtcOffsetMinutes * 60_000) / MILLIS_PER_DAY);
  }

  /**
   * PRD 18.4. Changing the phone timezone must not manufacture earning days —
   * that would defeat the daily ceiling, the streak ladder, and the >=7
   * distinct alarm-days payout gate, which is the load-bearing anti-farming
   * control in the product.
   */
  mayRollOver(lastDayStartMs: number, serverEpochMs: number): boolean {
    if (lastDayStartMs <= 0) return true;               // first ever day
    if (serverEpochMs < lastDayStartMs) return false;   // clock ran backwards
    return serverEpochMs - lastDayStartMs >= MIN_DAY_GAP_MS;
  }
}

export function mayChangeTimezone(lastChangeDayIndex: number | null, todayIndex: number): boolean {
  return lastChangeDayIndex === null ||
    todayIndex - lastChangeDayIndex >= TIMEZONE_CHANGE_COOLDOWN_DAYS;
}

/* --------------------------------------------------------------------- referrals */

export const MAX_PAID_REFERRALS_PER_MONTH = 10;

export interface ReferralClaim {
  readonly referrerUserId: string;
  readonly refereeUserId: string;
  readonly referrerDeviceHash: string;
  readonly refereeDeviceHash: string;
  readonly referrerVpaHash: string;
  readonly refereeVpaHash: string;
  /** The referee must have been paid out on their own first, PRD 18.7. */
  readonly refereeHasBeenPaidOut: boolean;
  readonly refereeAlarmDays: number;
  readonly pairAlreadyPaid: boolean;
  readonly referrerPaidThisMonth: number;
}

export type ReferralRejectReason =
  | 'self_referral'
  | 'same_device'
  | 'same_payment_instrument'
  | 'referee_not_paid_out'
  | 'referee_gate_not_met'
  | 'pair_already_paid'
  | 'monthly_cap';

export const REFERRAL_ALARM_DAY_GATE = 7;

/**
 * PRD 18.7. Rs5 to each side means Rs10 per fake pair, so the pair has to be
 * two genuinely different people who have each already been paid.
 */
export function evaluateReferral(c: ReferralClaim): { ok: true } | { ok: false; reason: ReferralRejectReason } {
  if (c.referrerUserId === c.refereeUserId) return { ok: false, reason: 'self_referral' };
  if (c.referrerDeviceHash === c.refereeDeviceHash) return { ok: false, reason: 'same_device' };
  if (c.referrerVpaHash === c.refereeVpaHash) return { ok: false, reason: 'same_payment_instrument' };
  if (c.pairAlreadyPaid) return { ok: false, reason: 'pair_already_paid' };
  if (c.refereeAlarmDays < REFERRAL_ALARM_DAY_GATE) return { ok: false, reason: 'referee_gate_not_met' };
  if (!c.refereeHasBeenPaidOut) return { ok: false, reason: 'referee_not_paid_out' };
  if (c.referrerPaidThisMonth >= MAX_PAID_REFERRALS_PER_MONTH) return { ok: false, reason: 'monthly_cap' };
  return { ok: true };
}

/* ------------------------------------------------------------------ rate limits */

export interface RateLimitRule {
  readonly max: number;
  readonly windowMs: number;
}

/** PRD 18.6. OTP abuse is a direct SMS bill, and SMS is a modelled cost line. */
export const RATE_LIMITS = {
  otpPerNumber: { max: 3, windowMs: 60 * 60 * 1000 },
  otpPerIp: { max: 10, windowMs: 60 * 60 * 1000 },
  login: { max: 5, windowMs: 60 * 1000 },
  withdrawal: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  accountCreationPerDevice: { max: 3, windowMs: 7 * 24 * 60 * 60 * 1000 },
  /**
   * The SSV callback needs its own, far looser, rule.
   *
   * Every AdMob callback in the product arrives from a small set of Google
   * IPs, so a limit tuned for end-user traffic throttles **all** revenue at
   * once. This bound exists only to cap an unauthenticated flood of ECDSA
   * verifications; the control that actually limits what one account can earn
   * is the 20-view daily ceiling, which is enforced per user regardless of
   * where the callback came from.
   */
  ssvPerIp: { max: 6_000, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Sliding-window check. `hits` are the server timestamps of previous attempts;
 * production keeps them in Firestore or Redis keyed by subject.
 */
export function withinRateLimit(hits: readonly number[], rule: RateLimitRule, nowMs: number): boolean {
  const cutoff = nowMs - rule.windowMs;
  let recent = 0;
  for (const h of hits) if (h > cutoff) recent++;
  return recent < rule.max;
}

/* ---------------------------------------------------------------------- payouts */

export const SUBSEQUENT_PAYOUT_THRESHOLD_PAISE = 3000n; // Rs30
export const FIRST_PAYOUT_THRESHOLD_PAISE = 1000n;      // Rs10
export const ALARM_DAY_GATE = 7;                        // PRD 6.3

export interface PayoutRequest {
  readonly withdrawable: Paise;
  readonly hasWithdrawnEver: boolean;
  readonly distinctAlarmDays: number;
  readonly playIntegrityPassed: boolean;
  readonly underReview: boolean;
  /** Client-supplied request id. Makes a double-tap idempotent. PRD 18.8. */
  readonly requestId: string;
  readonly requestIdAlreadyUsed: boolean;
}

export type PayoutRejectReason =
  | 'under_review'
  | 'integrity_failed'
  | 'alarm_gate_not_met'
  | 'below_threshold'
  | 'duplicate_request';

export type PayoutOutcome =
  | { readonly ok: true; readonly amount: Paise; readonly remaining: Paise }
  | { readonly ok: false; readonly reason: PayoutRejectReason };

export function evaluatePayout(r: PayoutRequest): PayoutOutcome {
  // Idempotency first: a replayed request must not even be re-evaluated.
  if (r.requestIdAlreadyUsed) return { ok: false, reason: 'duplicate_request' };
  if (r.underReview) return { ok: false, reason: 'under_review' };
  if (!r.playIntegrityPassed) return { ok: false, reason: 'integrity_failed' };

  // The 7-distinct-alarm-day gate applies to the FIRST payout only; it is what
  // makes farming cost a week of wall-clock time per Rs10. PRD 6.3.
  if (!r.hasWithdrawnEver && r.distinctAlarmDays < ALARM_DAY_GATE) {
    return { ok: false, reason: 'alarm_gate_not_met' };
  }

  const threshold = r.hasWithdrawnEver
    ? SUBSEQUENT_PAYOUT_THRESHOLD_PAISE
    : FIRST_PAYOUT_THRESHOLD_PAISE;
  if (r.withdrawable < threshold) return { ok: false, reason: 'below_threshold' };

  // Everything earned is withdrawable in full. No monthly release limit, ever
  // — PRD 6.1. Easy to promise honestly when the money was collected first.
  return { ok: true, amount: r.withdrawable, remaining: subtract(r.withdrawable, r.withdrawable) };
}
