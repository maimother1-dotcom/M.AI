/**
 * The endpoints. Every one of them is thin: the decisions live in ssv.ts,
 * reward.ts, integrity.ts and lifecycle.ts, which are unit tested on their own.
 *
 * Two invariants hold across this whole file, and both are checked by
 * `tests/verify_security.py` as well as by the request-level suite:
 *
 * 1. **An authenticated handler receives `userId` as a parameter.** It never
 *    reads an identity from the body, the query string or the path. That is
 *    what makes IDOR structurally impossible here rather than a bug waiting to
 *    be reintroduced.
 * 2. **No handler accepts an amount.** Every rupee figure is recomputed
 *    server-side from the ledger and the share ladder.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { DayBoundary, RATE_LIMITS, evaluatePayout } from '../integrity';
import { completeAlarm, rollForward } from '../lifecycle';
import { formatPaise } from '../money';
import { DAILY_VIEW_CEILING, credit, tierFor } from '../reward';
import { idempotencyKey, verifySsv } from '../ssv';
import { StoredLedgerEntry, applyUserState, toUserState } from '../store';
import { HttpError, consumeRateLimit, send, sendError } from './guard';
import { mintSession, resolveSession, revokeSession } from './session';
import type { Ctx, Deps } from './types';

/* ------------------------------------------------------------------- helpers */

export function hashPhone(phone: string, pepper: string): string {
  return createHmac('sha256', pepper).update(phone).digest('hex');
}

/**
 * E.164, strictly. Rejecting malformed input at the edge is why an injection
 * payload never reaches storage in the first place: it is not a valid phone
 * number, so it is a 400 long before any query is built.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

function requireString(body: Record<string, unknown>, key: string, maxLen: number): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) {
    throw new HttpError(400, 'invalid_request');
  }
  return v;
}

function optionalString(body: Record<string, unknown>, key: string, maxLen: number): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > maxLen) throw new HttpError(400, 'invalid_request');
  return v;
}

function boundaryFor(offsetMinutes: number): DayBoundary {
  return new DayBoundary(offsetMinutes);
}

/* ---------------------------------------------------------------------- auth */

export async function otpRequest(ctx: Ctx, deps: Deps): Promise<void> {
  const phone = requireString(ctx.body, 'phone', 20);
  if (!E164.test(phone)) throw new HttpError(400, 'invalid_request');

  const now = deps.clock();
  const subject = hashPhone(phone, deps.config.phonePepper);

  // Both limits are consumed before the SMS, because the SMS is the cost.
  const perNumber = await consumeRateLimit(deps.store, `otp:num:${subject}`, RATE_LIMITS.otpPerNumber, now);
  const perIp = await consumeRateLimit(deps.store, `otp:ip:${ctx.ip}`, RATE_LIMITS.otpPerIp, now);
  if (!perNumber || !perIp) throw new HttpError(429, 'rate_limited');

  await deps.otp.send(phone);
  // Never reveals whether the number is registered. That would be a free
  // membership oracle for anyone with a list of phone numbers.
  send(ctx.res, 200, { ok: true });
}

export async function otpVerify(ctx: Ctx, deps: Deps): Promise<void> {
  const phone = requireString(ctx.body, 'phone', 20);
  if (!E164.test(phone)) throw new HttpError(400, 'invalid_request');
  const code = requireString(ctx.body, 'code', 10);
  const integrityToken = optionalString(ctx.body, 'integrityToken', 8192);
  const offsetRaw = ctx.body.utcOffsetMinutes;
  const utcOffsetMinutes = typeof offsetRaw === 'number' ? offsetRaw : 330; // IST default

  const now = deps.clock();
  if (!await consumeRateLimit(deps.store, `login:${ctx.ip}`, RATE_LIMITS.login, now)) {
    throw new HttpError(429, 'rate_limited');
  }

  if (!await deps.otp.check(phone, code)) throw new HttpError(401, 'bad_credentials');

  const phoneHash = hashPhone(phone, deps.config.phonePepper);
  let user = await deps.store.findByPhoneHash(phoneHash);

  if (!user) {
    // Signup. Play Integrity gates account creation, because a farm of
    // emulated devices is the cheapest way to attack a rewards product.
    const verdict = await deps.integrity.verify(integrityToken, phoneHash);
    if (deps.config.requireIntegrity && !verdict.passed) {
      throw new HttpError(403, 'integrity_failed');
    }
    const deviceHash = verdict.deviceHash ?? 'unverified';
    const ok = await consumeRateLimit(
      deps.store, `signup:dev:${deviceHash}`, RATE_LIMITS.accountCreationPerDevice, now,
    );
    if (!ok) throw new HttpError(429, 'rate_limited');

    // Validated here rather than trusted: an implausible offset would let a
    // client pick its own day boundary. DayBoundary throws on out-of-range.
    boundaryFor(utcOffsetMinutes);
    user = await deps.store.createUser({
      userId: randomUUID(), phoneHash, deviceHash,
      pinnedUtcOffsetMinutes: utcOffsetMinutes, createdAtMs: now,
    });
  }

  const session = await mintSession(deps.store, user.userId, now, deps.config.sessionTtlMs);
  send(ctx.res, 200, { token: session.token, expiresAtMs: session.expiresAtMs });
}

export async function logout(ctx: Ctx, deps: Deps): Promise<void> {
  await revokeSession(deps.store, ctx.req.headers.authorization);
  send(ctx.res, 200, { ok: true });
}

/* --------------------------------------------------------------------- alarm */

export async function alarmComplete(ctx: Ctx, deps: Deps, userId: string): Promise<void> {
  const now = deps.clock();
  const result = await deps.store.withUserLock(userId, async (user, tx) => {
    const boundary = boundaryFor(user.pinnedUtcOffsetMinutes);
    const rolled = rollForward(user, boundary, now).user;
    const outcome = completeAlarm(rolled, rolled.currentDayIndex);
    tx.save(outcome.user);
    return {
      dayIndex: outcome.user.currentDayIndex,
      streakDays: outcome.user.streakDays,
      firstToday: outcome.firstToday,
    };
  });
  if (!result) throw new HttpError(401, 'unauthorized');
  send(ctx.res, 200, result);
}

/* ----------------------------------------------------------------------- ssv */

/**
 * AdMob's server-side verification callback. **The only unauthenticated
 * endpoint in the system, and the only one that creates money.**
 *
 * Google retries on a non-2xx response, so anything we have genuinely handled —
 * including a duplicate and including a business rejection like the daily
 * ceiling — answers 200. Only a callback we could not authenticate answers 400,
 * because retrying that will never help and a visible 400 belongs in monitoring.
 */
export async function ssvCallback(ctx: Ctx, deps: Deps): Promise<void> {
  const now = deps.clock();

  // Verifying an ECDSA signature is not free, and this endpoint is public.
  // Deliberately `ssvPerIp` and not a user-traffic limit: all of Google's
  // callbacks share a handful of source addresses, so a tight per-IP rule here
  // would throttle every user's earnings at once.
  if (!await consumeRateLimit(deps.store, `ssv:ip:${ctx.ip}`, RATE_LIMITS.ssvPerIp, now)) {
    throw new HttpError(429, 'rate_limited');
  }

  const rawQuery = ctx.rawQuery;
  const verdict = verifySsv(rawQuery, await deps.ssvKeys(), now);
  if (!verdict.verified) {
    deps.log('ssv_rejected', { reason: verdict.reason });
    return void sendError(ctx.res, 400, 'ssv_rejected');
  }

  const userId = verdict.userId!;
  const key = idempotencyKey(userId, verdict.transactionId!);

  const outcome = await deps.store.withUserLock(userId, async (user, tx) => {
    const boundary = boundaryFor(user.pinnedUtcOffsetMinutes);
    const rolled = rollForward(user, boundary, now).user;

    // Claim first, then let the engine decide. The claim is an insert that
    // either wins or collides; a replayed callback loses it and is rejected as
    // a duplicate by the same code path that rejects everything else.
    const claimed = await tx.claim('ssv', key);
    const gross = await deps.revenue.grossMicropaiseForView(verdict.adNetwork ?? null);

    const result = credit({
      state: toUserState(rolled),
      verified: true,
      grossMicropaise: gross,
      idempotencyKey: key,
      alreadySeen: !claimed,
      dayIndex: rolled.currentDayIndex,
    });

    // Audit row is written for rejections too, and before the wallet moves.
    // PRD 18.8.
    const entry: StoredLedgerEntry = { ...result.entry, userId, atMs: now };
    tx.appendLedger(entry);
    tx.save(applyUserState(rolled, result.state));

    return result.kind === 'credited'
      ? { credited: true as const, amount: result.amount }
      : { credited: false as const, reason: result.reason };
  });

  if (!outcome) {
    // No such user. Acknowledge so Google stops retrying, credit nothing, and
    // never create an account from an unauthenticated callback.
    deps.log('ssv_unknown_user', {});
    return void send(ctx.res, 200, { ok: true });
  }
  send(ctx.res, 200, { ok: true });
}

/* -------------------------------------------------------------------- wallet */

export async function wallet(ctx: Ctx, deps: Deps, userId: string): Promise<void> {
  const user = await deps.store.getUser(userId);
  if (!user) throw new HttpError(401, 'unauthorized');
  send(ctx.res, 200, {
    withdrawableRupees: formatPaise(user.withdrawable),
    lifetimeRupees: formatPaise(user.lifetimeEarned),
    streakDays: user.streakDays,
    tier: tierFor(user.lifetimeEarned, user.streakDays),
    viewsToday: user.creditedViewsToday,
    dailyViewCeiling: DAILY_VIEW_CEILING,
    distinctAlarmDays: user.distinctAlarmDays,
  });
}

/**
 * The Daily Close receipt. PRD 4.8.
 *
 * Every figure is summed from the ledger. Nothing here is typed by hand, which
 * is exactly why the app can afford to show its working when no competitor
 * does.
 */
export async function dailyClose(ctx: Ctx, deps: Deps, userId: string): Promise<void> {
  const user = await deps.store.getUser(userId);
  if (!user) throw new HttpError(401, 'unauthorized');

  const entries = await deps.store.ledgerForDay(userId, user.currentDayIndex);
  let earned = 0n;
  let creditedViews = 0;
  for (const e of entries) {
    earned += e.credited;
    if (e.rejectedFor === null) creditedViews++;
  }

  send(ctx.res, 200, {
    dayIndex: user.currentDayIndex,
    creditedViews,
    earnedRupees: formatPaise(earned),
    tier: tierFor(user.lifetimeEarned, user.streakDays),
    streakDays: user.streakDays,
    dailyViewCeiling: DAILY_VIEW_CEILING,
  });
}

/* -------------------------------------------------------------------- payout */

export async function payout(ctx: Ctx, deps: Deps, userId: string): Promise<void> {
  const requestId = requireString(ctx.body, 'requestId', 64);
  const vpaHash = requireString(ctx.body, 'vpaHash', 128);
  const integrityToken = optionalString(ctx.body, 'integrityToken', 8192);

  const now = deps.clock();
  if (!await consumeRateLimit(deps.store, `payout:${userId}`, RATE_LIMITS.withdrawal, now)) {
    throw new HttpError(429, 'rate_limited');
  }

  // The nonce binds the attestation to this specific request, so a captured
  // integrity token cannot be replayed against a different withdrawal.
  const verdict = await deps.integrity.verify(integrityToken, requestId);
  const integrityPassed = deps.config.requireIntegrity ? verdict.passed : true;

  const result = await deps.store.withUserLock(userId, async (user, tx) => {
    const claimed = await tx.claim('payout', requestId);
    const decision = evaluatePayout({
      withdrawable: user.withdrawable,
      hasWithdrawnEver: user.hasWithdrawnEver,
      distinctAlarmDays: user.distinctAlarmDays,
      playIntegrityPassed: integrityPassed,
      underReview: user.underReview,
      requestId,
      requestIdAlreadyUsed: !claimed,
    });
    if (!decision.ok) return decision;

    tx.recordPayout({ userId, requestId, amount: decision.amount, atMs: now, vpaHash });
    tx.save({
      ...user,
      withdrawable: decision.remaining,
      hasWithdrawnEver: true,
    });
    return decision;
  });

  if (!result) throw new HttpError(401, 'unauthorized');
  if (!result.ok) return void sendError(ctx.res, 409, result.reason);
  send(ctx.res, 200, { paidRupees: formatPaise(result.amount), requestId });
}

/* ------------------------------------------------------------------- account */

export async function deleteAccount(ctx: Ctx, deps: Deps, userId: string): Promise<void> {
  await deps.store.deleteAccount(userId, deps.clock());
  send(ctx.res, 200, { ok: true });
}

/* Re-exported so the router can resolve identity in exactly one place. */
export { resolveSession };
