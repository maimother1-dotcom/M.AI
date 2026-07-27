/**
 * The credit engine, server side. PRD 2.
 *
 * Mirrors android/core/.../RewardEngine.kt. The Android copy exists so the app
 * can render an optimistic figure; **this** copy is the one that decides what
 * the user is actually paid. The client never supplies an amount, a share tier,
 * or a day index.
 */
import { MICROPAISE_PER_PAISA, Paise, ZERO, roundWithCarry, rupeesToPaise } from './money';

export const SHARE_BASIS_POINTS = {
  BASE: 5000,        // days 1-6
  STREAK_7: 5500,    // day 7+
  STREAK_30: 6000,   // day 30+, the worst case profit is tested against
  ACQUISITION: 7000, // until the first Rs10, booked as acquisition (PRD 6.2)
} as const;

export type ShareTier = keyof typeof SHARE_BASIS_POINTS;

/** PRD 2. Per day, not per month, so the app never goes dead mid-cycle. */
export const DAILY_VIEW_CEILING = 20;

export const FIRST_PAYOUT_THRESHOLD: Paise = rupeesToPaise(10);

export function tierFor(lifetimeEarned: Paise, streakDays: number): ShareTier {
  if (streakDays < 0) throw new RangeError('streak cannot be negative');
  if (lifetimeEarned < FIRST_PAYOUT_THRESHOLD) return 'ACQUISITION';
  if (streakDays >= 30) return 'STREAK_30';
  if (streakDays >= 7) return 'STREAK_7';
  return 'BASE';
}

/**
 * Entitlement in micropaise for one verified view.
 *
 * `grossMicropaise` is the realised value reported by the ad network. Zero in,
 * zero out — that is the whole point. `spinBonusBasisPoints` multiplies money
 * that already arrived, so even a jackpot cannot conjure revenue.
 */
export function entitlementMicropaise(
  grossMicropaise: bigint,
  tier: ShareTier,
  spinBonusBasisPoints = 0,
): bigint {
  if (grossMicropaise < 0n) throw new RangeError('gross cannot be negative');
  if (spinBonusBasisPoints < 0 || spinBonusBasisPoints > 10_000) {
    throw new RangeError('spin bonus out of range');
  }
  const effective = BigInt(SHARE_BASIS_POINTS[tier]) * (10_000n + BigInt(spinBonusBasisPoints));
  return (grossMicropaise * effective) / 10_000n / 10_000n;
}

export type RejectReason =
  | 'not_verified'
  | 'duplicate'
  | 'alarm_not_completed'
  | 'daily_ceiling'
  | 'account_under_review';

export interface UserState {
  readonly lifetimeEarned: Paise;
  readonly withdrawable: Paise;
  readonly streakDays: number;
  readonly carryMicropaise: bigint;
  readonly alarmCompletedForDay: number | null;
  readonly creditedViewsToday: number;
  readonly spinBonusBasisPoints: number;
  readonly underReview: boolean;
}

export interface LedgerEntry {
  readonly dayIndex: number;
  readonly verified: boolean;
  readonly grossMicropaise: bigint;
  readonly tier: ShareTier | null;
  readonly credited: Paise;
  readonly idempotencyKey: string | null;
  readonly rejectedFor: RejectReason | null;
}

export type CreditOutcome =
  | { readonly kind: 'credited'; readonly amount: Paise; readonly state: UserState; readonly entry: LedgerEntry }
  | { readonly kind: 'rejected'; readonly reason: RejectReason; readonly state: UserState; readonly entry: LedgerEntry };

export interface CreditInput {
  readonly state: UserState;
  /** True only when verifySsv() returned verified. The client cannot set this. */
  readonly verified: boolean;
  readonly grossMicropaise: bigint;
  readonly idempotencyKey: string | null;
  /** Whether this idempotency key has already been recorded for the user. */
  readonly alreadySeen: boolean;
  readonly dayIndex: number;
}

export function credit(input: CreditInput): CreditOutcome {
  const { state, dayIndex } = input;

  const reject = (reason: RejectReason): CreditOutcome => ({
    kind: 'rejected',
    reason,
    state,
    entry: {
      dayIndex,
      verified: input.verified,
      grossMicropaise: input.verified ? input.grossMicropaise : 0n,
      tier: null,
      credited: ZERO,
      idempotencyKey: input.idempotencyKey,
      rejectedFor: reason,
    },
  });

  // 1. Verification is the gate, checked first and unconditionally.
  if (!input.verified) return reject('not_verified');

  // 2. Replay protection. The same signed callback twice pays once.
  if (!input.idempotencyKey || input.alreadySeen) return reject('duplicate');

  // 3. Earning is tied to a real wake-up that same day. PRD 4.7.
  if (state.alarmCompletedForDay !== dayIndex) return reject('alarm_not_completed');

  if (state.underReview) return reject('account_under_review');

  // 4. Daily ceiling. PRD 2.
  if (state.creditedViewsToday >= DAILY_VIEW_CEILING) return reject('daily_ceiling');

  const tier = tierFor(state.lifetimeEarned, state.streakDays);
  const owed = entitlementMicropaise(input.grossMicropaise, tier, state.spinBonusBasisPoints);
  const { paise, carry } = roundWithCarry(owed, state.carryMicropaise);

  return {
    kind: 'credited',
    amount: paise,
    state: {
      ...state,
      lifetimeEarned: state.lifetimeEarned + paise,
      withdrawable: state.withdrawable + paise,
      carryMicropaise: carry,
      creditedViewsToday: state.creditedViewsToday + 1,
    },
    entry: {
      dayIndex,
      verified: true,
      grossMicropaise: input.grossMicropaise,
      tier,
      credited: paise,
      idempotencyKey: input.idempotencyKey,
      rejectedFor: null,
    },
  };
}

/** Sanity constant so the parity test can compare against the Kotlin core. */
export const MICROPAISE_PER_PAISA_EXPORT = MICROPAISE_PER_PAISA;
