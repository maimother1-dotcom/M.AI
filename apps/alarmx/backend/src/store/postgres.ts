/**
 * Postgres Store.
 *
 * **Not verified.** There is no Postgres in this environment, so unlike
 * everything else in `backend/`, this file has been reviewed and typechecked
 * but never executed. Read it as a first draft that a database has not seen.
 * `MemoryStore` is what the test suite runs against, and it reproduces the
 * mutual-exclusion and atomicity properties this file is supposed to provide.
 *
 * It takes a `SqlPool` rather than importing `pg`, which keeps the backend's
 * runtime dependency count at zero and keeps every query visible in one file.
 * Wiring `pg` to it is about ten lines — see the bottom of this file.
 *
 * Every query is parameterised. There is no string concatenation anywhere near
 * SQL in this file, and `tests/verify_security.py` fails the build if one
 * appears.
 */
import { Paise } from '../money';
import { RejectReason, ShareTier } from '../reward';
import {
  ClaimKind, NewUser, PayoutRecord, SessionRecord, StoredLedgerEntry,
  Store, Tx, UserRecord,
} from './index';

export interface SqlResult { readonly rows: readonly Record<string, unknown>[]; }

export interface SqlClient {
  query(text: string, params?: readonly unknown[]): Promise<SqlResult>;
}

export interface SqlPool extends SqlClient {
  /** Must run `fn` on a single connection wrapped in BEGIN / COMMIT / ROLLBACK. */
  transaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T>;
}

const USER_COLUMNS = `
  user_id, phone_hash, device_hash, pinned_utc_offset_minutes, created_at_ms,
  lifetime_earned_paise, withdrawable_paise, carry_micropaise,
  streak_days, distinct_alarm_days, alarm_completed_for_day,
  credited_views_today, current_day_index, last_day_start_ms,
  last_timezone_change_day, spin_bonus_basis_points, under_review,
  has_withdrawn_ever, deleted_at_ms`;

/**
 * NUMERIC and BIGINT arrive from `pg` as strings, because they do not fit a
 * JS number. Converting through Number() here would silently corrupt balances
 * above 2^53, so everything money-shaped goes straight to BigInt.
 */
function toBigInt(v: unknown): bigint {
  return BigInt(String(v));
}
function toNumber(v: unknown): number {
  return Number(v);
}
function toNullableNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    userId: String(row.user_id),
    phoneHash: row.phone_hash === null ? '' : String(row.phone_hash),
    deviceHash: row.device_hash === null ? '' : String(row.device_hash),
    pinnedUtcOffsetMinutes: toNumber(row.pinned_utc_offset_minutes),
    createdAtMs: toNumber(row.created_at_ms),
    lifetimeEarned: toBigInt(row.lifetime_earned_paise),
    withdrawable: toBigInt(row.withdrawable_paise),
    carryMicropaise: toBigInt(row.carry_micropaise),
    streakDays: toNumber(row.streak_days),
    distinctAlarmDays: toNumber(row.distinct_alarm_days),
    alarmCompletedForDay: toNullableNumber(row.alarm_completed_for_day),
    creditedViewsToday: toNumber(row.credited_views_today),
    currentDayIndex: toNumber(row.current_day_index),
    lastDayStartMs: toNumber(row.last_day_start_ms),
    lastTimezoneChangeDayIndex: toNullableNumber(row.last_timezone_change_day),
    spinBonusBasisPoints: toNumber(row.spin_bonus_basis_points),
    underReview: Boolean(row.under_review),
    hasWithdrawnEver: Boolean(row.has_withdrawn_ever),
    deletedAtMs: toNullableNumber(row.deleted_at_ms),
  };
}

export class PostgresStore implements Store {
  constructor(private readonly pool: SqlPool) {}

  async createUser(init: NewUser): Promise<UserRecord> {
    const r = await this.pool.query(
      `INSERT INTO users (user_id, phone_hash, device_hash,
                          pinned_utc_offset_minutes, created_at_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [init.userId, init.phoneHash, init.deviceHash,
       init.pinnedUtcOffsetMinutes, init.createdAtMs],
    );
    return mapUser(r.rows[0]!);
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const r = await this.pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1 AND deleted_at_ms IS NULL`,
      [userId],
    );
    return r.rows[0] ? mapUser(r.rows[0]) : null;
  }

  async findByPhoneHash(phoneHash: string): Promise<UserRecord | null> {
    const r = await this.pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE phone_hash = $1 AND deleted_at_ms IS NULL`,
      [phoneHash],
    );
    return r.rows[0] ? mapUser(r.rows[0]) : null;
  }

  /**
   * `SELECT ... FOR UPDATE` is the whole point of this method. It holds a row
   * lock for the length of the transaction, so two concurrent withdrawals
   * serialise instead of both reading the same balance. PRD 18.8.
   */
  async withUserLock<T>(
    userId: string,
    fn: (user: UserRecord, tx: Tx) => Promise<T>,
  ): Promise<T | null> {
    return this.pool.transaction(async (client) => {
      const r = await client.query(
        `SELECT ${USER_COLUMNS} FROM users
         WHERE user_id = $1 AND deleted_at_ms IS NULL
         FOR UPDATE`,
        [userId],
      );
      const row = r.rows[0];
      if (!row) return null;

      const user = mapUser(row);
      const writes: Array<() => Promise<void>> = [];
      const tx: Tx = {
        save: (u) => { writes.push(() => this.writeUser(client, u)); },
        appendLedger: (e) => { writes.push(() => this.writeLedger(client, e)); },
        recordPayout: (p) => { writes.push(() => this.writePayout(client, p)); },
        claim: async (kind, key) => {
          // ON CONFLICT DO NOTHING turns the race into a return value. Nothing
          // reads before writing, so there is no window to lose.
          const c = await client.query(
            `INSERT INTO claims (user_id, kind, key, at_ms)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, kind, key) DO NOTHING
             RETURNING key`,
            [userId, kind satisfies ClaimKind, key, Date.now()],
          );
          return c.rows.length > 0;
        },
      };

      const result = await fn(user, tx);
      // Ledger rows land before the wallet update in the same transaction, so a
      // credit can never be visible without its audit row. PRD 18.8.
      for (const w of writes) await w();
      return result;
    });
  }

  private async writeUser(client: SqlClient, u: UserRecord): Promise<void> {
    await client.query(
      `UPDATE users SET
         lifetime_earned_paise = $2, withdrawable_paise = $3, carry_micropaise = $4,
         streak_days = $5, distinct_alarm_days = $6, alarm_completed_for_day = $7,
         credited_views_today = $8, current_day_index = $9, last_day_start_ms = $10,
         last_timezone_change_day = $11, spin_bonus_basis_points = $12,
         under_review = $13, has_withdrawn_ever = $14
       WHERE user_id = $1`,
      [u.userId, u.lifetimeEarned.toString(), u.withdrawable.toString(),
       u.carryMicropaise.toString(), u.streakDays, u.distinctAlarmDays,
       u.alarmCompletedForDay, u.creditedViewsToday, u.currentDayIndex,
       u.lastDayStartMs, u.lastTimezoneChangeDayIndex, u.spinBonusBasisPoints,
       u.underReview, u.hasWithdrawnEver],
    );
  }

  private async writeLedger(client: SqlClient, e: StoredLedgerEntry): Promise<void> {
    await client.query(
      `INSERT INTO ledger (user_id, day_index, at_ms, verified, gross_micropaise,
                           tier, credited_paise, idempotency_key, rejected_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [e.userId, e.dayIndex, e.atMs, e.verified, e.grossMicropaise.toString(),
       e.tier satisfies ShareTier | null, e.credited.toString(),
       e.idempotencyKey, e.rejectedFor satisfies RejectReason | null],
    );
  }

  private async writePayout(client: SqlClient, p: PayoutRecord): Promise<void> {
    await client.query(
      `INSERT INTO payouts (user_id, request_id, amount_paise, at_ms, vpa_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [p.userId, p.requestId, p.amount.toString(), p.atMs, p.vpaHash],
    );
  }

  async createSession(tokenHash: string, userId: string, expiresAtMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at_ms) VALUES ($1, $2, $3)`,
      [tokenHash, userId, expiresAtMs],
    );
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const r = await this.pool.query(
      `SELECT user_id, expires_at_ms FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = r.rows[0];
    return row ? { userId: String(row.user_id), expiresAtMs: toNumber(row.expires_at_ms) } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  async deleteSessionsFor(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  async recordRateHit(subject: string, atMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO rate_hits (subject, at_ms) VALUES ($1, $2)`, [subject, atMs],
    );
  }

  async recentHits(subject: string, sinceMs: number): Promise<readonly number[]> {
    const r = await this.pool.query(
      `SELECT at_ms FROM rate_hits WHERE subject = $1 AND at_ms > $2`, [subject, sinceMs],
    );
    return r.rows.map((row) => toNumber(row.at_ms));
  }

  async ledgerForDay(userId: string, dayIndex: number): Promise<readonly StoredLedgerEntry[]> {
    const r = await this.pool.query(
      `SELECT user_id, day_index, at_ms, verified, gross_micropaise, tier,
              credited_paise, idempotency_key, rejected_for
       FROM ledger WHERE user_id = $1 AND day_index = $2 ORDER BY id`,
      [userId, dayIndex],
    );
    return r.rows.map((row) => ({
      userId: String(row.user_id),
      dayIndex: toNumber(row.day_index),
      atMs: toNumber(row.at_ms),
      verified: Boolean(row.verified),
      grossMicropaise: toBigInt(row.gross_micropaise),
      tier: (row.tier === null ? null : String(row.tier)) as ShareTier | null,
      credited: toBigInt(row.credited_paise) as Paise,
      idempotencyKey: row.idempotency_key === null ? null : String(row.idempotency_key),
      rejectedFor: (row.rejected_for === null ? null : String(row.rejected_for)) as RejectReason | null,
    }));
  }

  /**
   * PRD 18.2. Anonymise rather than DELETE: the row is what stops a deleted
   * number silently re-registering into a fresh acquisition-tier account, and
   * the id it keeps is opaque and carries nothing personal.
   */
  async deleteAccount(userId: string, atMs: number): Promise<void> {
    await this.pool.transaction(async (client) => {
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM ledger WHERE user_id = $1`, [userId]);
      await client.query(
        `UPDATE users SET phone_hash = NULL, device_hash = NULL, deleted_at_ms = $2
         WHERE user_id = $1`,
        [userId, atMs],
      );
    });
  }
}

/*
 * Wiring `pg` to SqlPool, for whoever deploys this:
 *
 *   import { Pool } from 'pg';
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
 *
 *   const sql: SqlPool = {
 *     query: (text, params) => pool.query(text, params as unknown[]),
 *     async transaction(fn) {
 *       const client = await pool.connect();
 *       try {
 *         await client.query('BEGIN');
 *         const out = await fn({ query: (t, p) => client.query(t, p as unknown[]) });
 *         await client.query('COMMIT');
 *         return out;
 *       } catch (e) {
 *         await client.query('ROLLBACK');
 *         throw e;
 *       } finally {
 *         client.release();
 *       }
 *     },
 *   };
 *
 * `ssl: { rejectUnauthorized: true }` is not optional. CLAUDE.md: TLS in
 * transit, database connections included.
 */
