/**
 * Authentication: opaque server-side sessions, deliberately **not** JWT.
 *
 * A signed token that the client holds has to be verified correctly every time,
 * and the ways to get that wrong are well known and still shipped constantly:
 * `alg: none`, HS256/RS256 confusion, unbounded lifetimes, no revocation. None
 * of those failures are possible here, because the token carries no claims at
 * all. It is 32 random bytes. Everything true about the session lives in the
 * database, where we can change or revoke it instantly.
 *
 * The token is stored **hashed**. A database leak yields no usable sessions,
 * which is the same reasoning that says never store a password.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Store } from '../store';

/** 30 days. Long enough that an alarm app is not logging people out weekly. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

export interface MintedSession {
  readonly token: string;
  readonly expiresAtMs: number;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function mintSession(
  store: Store,
  userId: string,
  nowMs: number,
  ttlMs: number = SESSION_TTL_MS,
): Promise<MintedSession> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAtMs = nowMs + ttlMs;
  await store.createSession(hashToken(token), userId, expiresAtMs);
  return { token, expiresAtMs };
}

/**
 * Resolve a Bearer token to a user id, or null.
 *
 * **This is the only place a request's identity comes from.** No handler may
 * read a user id from a body, a query parameter or a path segment. That single
 * rule is what makes IDOR impossible rather than merely unlikely, and
 * `tests/verify_security.py` asserts it statically against every handler.
 */
export async function resolveSession(
  store: Store,
  authorization: string | undefined,
  nowMs: number,
): Promise<string | null> {
  const token = parseBearer(authorization);
  if (!token) return null;

  const record = await store.findSession(hashToken(token));
  if (!record) return null;

  if (record.expiresAtMs <= nowMs) {
    await store.deleteSession(hashToken(token));
    return null;
  }

  // The account may have been deleted while the session was still live.
  const user = await store.getUser(record.userId);
  if (!user) return null;

  return record.userId;
}

export async function revokeSession(store: Store, authorization: string | undefined): Promise<void> {
  const token = parseBearer(authorization);
  if (token) await store.deleteSession(hashToken(token));
}

function parseBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const prefix = 'Bearer ';
  if (authorization.length <= prefix.length) return null;
  // Constant-time on the scheme so the header shape is not a timing oracle.
  // Cheap, and it costs nothing to be consistent about it.
  const given = Buffer.from(authorization.slice(0, prefix.length));
  const want = Buffer.from(prefix);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const token = authorization.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}
