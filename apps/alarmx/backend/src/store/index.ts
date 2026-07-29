/**
 * Persistence, behind an interface.
 *
 * Two rules govern the whole design, and both exist because this store holds
 * money:
 *
 * 1. **Every read-modify-write of a user row happens inside `withUserLock`.**
 *    A handler that reads a balance, decides, and writes it back outside a lock
 *    is a double-spend waiting for two taps to land in the same millisecond.
 *    The interface makes the safe path the only path: `save` is only reachable
 *    from inside the callback.
 *
 * 2. **Idempotency is claimed, not checked.** `claim()` is an insert that
 *    either succeeds or collides, never a SELECT followed by an INSERT. In SQL
 *    that is a unique index doing the work; checking first and inserting after
 *    is the same race in a different costume.
 */
import { Paise } from '../money';
import { RejectReason, ShareTier, UserState } from '../reward';

/** What a claimed key is for. Keyspaces are separate so they cannot collide. */
export type ClaimKind = 'ssv' | 'payout';

export interface UserRecord {
  readonly userId: string;
  /** Never the phone number itself. PRD 18.2. */
  readonly phoneHash: string;
  readonly deviceHash: string;
  /** Pinned at signup. Changing it is rate limited. PRD 18.4. */
  readonly pinnedUtcOffsetMinutes: number;
  readonly createdAtMs: number;

  readonly lifetimeEarned: Paise;
  readonly withdrawable: Paise;
  readonly carryMicropaise: bigint;

  readonly streakDays: number;
  readonly distinctAlarmDays: number;
  readonly alarmCompletedForDay: number | null;
  readonly creditedViewsToday: number;
  readonly currentDayIndex: number;
  /** Server time the current day began. Feeds DayBoundary.mayRollOver. */
  readonly lastDayStartMs: number;
  readonly lastTimezoneChangeDayIndex: number | null;

  readonly spinBonusBasisPoints: number;
  readonly underReview: boolean;
  readonly hasWithdrawnEver: boolean;
  readonly deletedAtMs: number | null;
}

export interface NewUser {
  readonly userId: string;
  readonly phoneHash: string;
  readonly deviceHash: string;
  readonly pinnedUtcOffsetMinutes: number;
  readonly createdAtMs: number;
}

/** A ledger row. Written *before* the wallet moves. PRD 18.8. */
export interface StoredLedgerEntry {
  readonly userId: string;
  readonly dayIndex: number;
  readonly atMs: number;
  readonly verified: boolean;
  readonly grossMicropaise: bigint;
  readonly tier: ShareTier | null;
  readonly credited: Paise;
  readonly idempotencyKey: string | null;
  readonly rejectedFor: RejectReason | null;
}

export interface PayoutRecord {
  readonly userId: string;
  readonly requestId: string;
  readonly amount: Paise;
  readonly atMs: number;
  readonly vpaHash: string;
}

/**
 * The handle a locked section gets. Nothing here escapes the callback, which
 * is what stops a handler holding a stale `UserRecord` and writing it later.
 */
export interface Tx {
  save(user: UserRecord): void;
  appendLedger(entry: StoredLedgerEntry): void;
  recordPayout(payout: PayoutRecord): void;
  /**
   * Insert-or-collide. `true` means this caller owns the key; `false` means
   * somebody already did this exact thing and it must not happen twice.
   */
  claim(kind: ClaimKind, key: string): Promise<boolean>;
}

export interface SessionRecord {
  readonly userId: string;
  readonly expiresAtMs: number;
}

export interface Store {
  createUser(init: NewUser): Promise<UserRecord>;
  getUser(userId: string): Promise<UserRecord | null>;
  findByPhoneHash(phoneHash: string): Promise<UserRecord | null>;

  /**
   * Run `fn` with the user's row locked for the duration. Resolves to null if
   * the user does not exist or is deleted — callers must not distinguish those
   * two cases to a client, because doing so enumerates accounts.
   */
  withUserLock<T>(userId: string, fn: (user: UserRecord, tx: Tx) => Promise<T>): Promise<T | null>;

  /** Sessions are stored hashed. A database leak must not yield live tokens. */
  createSession(tokenHash: string, userId: string, expiresAtMs: number): Promise<void>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsFor(userId: string): Promise<void>;

  recordRateHit(subject: string, atMs: number): Promise<void>;
  recentHits(subject: string, sinceMs: number): Promise<readonly number[]>;

  ledgerForDay(userId: string, dayIndex: number): Promise<readonly StoredLedgerEntry[]>;

  /** PRD 18.2: deletion removes or anonymises everything. */
  deleteAccount(userId: string, atMs: number): Promise<void>;
}

/** Adapter to the shape `credit()` wants, so the engine stays storage-agnostic. */
export function toUserState(u: UserRecord): UserState {
  return {
    lifetimeEarned: u.lifetimeEarned,
    withdrawable: u.withdrawable,
    streakDays: u.streakDays,
    carryMicropaise: u.carryMicropaise,
    alarmCompletedForDay: u.alarmCompletedForDay,
    creditedViewsToday: u.creditedViewsToday,
    spinBonusBasisPoints: u.spinBonusBasisPoints,
    underReview: u.underReview,
  };
}

/** Fold an engine-produced UserState back onto the stored row. */
export function applyUserState(u: UserRecord, s: UserState): UserRecord {
  return {
    ...u,
    lifetimeEarned: s.lifetimeEarned,
    withdrawable: s.withdrawable,
    carryMicropaise: s.carryMicropaise,
    creditedViewsToday: s.creditedViewsToday,
    streakDays: s.streakDays,
    underReview: s.underReview,
  };
}
