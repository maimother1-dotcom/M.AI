/**
 * Money on the server. Integer paise only, never a JS number used as currency.
 *
 * PRD 18.3. One verified view is worth Rs0.1056 = 10.56 paise. Rounding that up
 * leaks Rs1.73-Rs3.45 per user per month against a Conservative-column profit of
 * Rs3.30 — enough to invert the no-loss guarantee at the daily view ceiling.
 * So: micropaise resolution, floor, and carry the remainder.
 *
 * This file deliberately mirrors android/core/.../Money.kt. The two are kept in
 * step by test/parity.test.ts, which fails if the constants ever diverge.
 */

/** 1 paisa = 1000 micropaise. Makes 10.56 paise exactly 10_560. */
export const MICROPAISE_PER_PAISA = 1000n;

/** Realised value of one verified rewarded view, Base column. */
export const VIEW_GROSS_MICROPAISE = 10_560n;

/**
 * Paise as a bigint. bigint rather than number because a busy account
 * accumulates a lot of small credits and Number.MAX_SAFE_INTEGER is not a
 * limit worth thinking about when it can simply be avoided.
 */
export type Paise = bigint;

export const ZERO: Paise = 0n;

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isInteger(rupees)) {
    throw new RangeError(`rupeesToPaise expects whole rupees, got ${rupees}`);
  }
  return BigInt(rupees) * 100n;
}

/** Display only. Never parse this back into a calculation. */
export function formatPaise(p: Paise): string {
  if (p < 0n) throw new RangeError('money cannot be negative');
  return `${p / 100n}.${(p % 100n).toString().padStart(2, '0')}`;
}

/** Subtraction that refuses to overdraw. A payout must never go negative. */
export function subtract(balance: Paise, amount: Paise): Paise {
  if (amount < 0n) throw new RangeError('cannot subtract a negative amount');
  if (balance < amount) throw new RangeError(`insufficient balance: ${balance} < ${amount}`);
  return balance - amount;
}

export interface RoundResult {
  /** Whole paise payable now. */
  readonly paise: Paise;
  /** Sub-paisa remainder to persist against the user. Always 0..999. */
  readonly carry: bigint;
}

/**
 * Floor a micropaise entitlement to whole paise, carrying the remainder.
 *
 * Never overpays at any single call, and loses less than one paisa in total
 * however long the stream runs.
 */
export function roundWithCarry(micropaise: bigint, carry: bigint): RoundResult {
  if (micropaise < 0n) throw new RangeError('entitlement cannot be negative');
  if (carry < 0n || carry >= MICROPAISE_PER_PAISA) {
    throw new RangeError(`carry must be a sub-paisa remainder, got ${carry}`);
  }
  const pool = carry + micropaise;
  return { paise: pool / MICROPAISE_PER_PAISA, carry: pool % MICROPAISE_PER_PAISA };
}
