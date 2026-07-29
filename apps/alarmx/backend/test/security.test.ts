/**
 * The attacks, run as real HTTP requests against a real server.
 *
 * PRD 18.10 listed IDOR, privilege escalation, session handling, injection and
 * CORS as "specified and unverified" because there was no server to point at.
 * This file is the answer to that paragraph. Everything here failed before the
 * code that stops it existed, which is the only reason to trust a passing
 * security test.
 */
import { strict as assert } from 'node:assert';
import { after, describe, test } from 'node:test';

import { RATE_LIMITS } from '../src/integrity';
import { SECURITY_HEADERS } from '../src/http/guard';
import { SESSION_TTL_MS } from '../src/http/session';
import { DAILY_VIEW_CEILING } from '../src/reward';
import {
  call, completeAlarmFor, deliverSsv, signUp, startHarness, VALID_OTP, type Harness,
} from './support';

/** Every harness gets closed, so a failing assert cannot leak a listening socket. */
const open: Harness[] = [];
async function harness(...args: Parameters<typeof startHarness>): Promise<Harness> {
  const h = await startHarness(...args);
  open.push(h);
  return h;
}
after(async () => { for (const h of open) await h.close(); });

/* ============================================================ identity / IDOR */

describe('identity', () => {
  test('an unauthenticated request cannot read a wallet', async () => {
    const h = await harness();
    const r = await call(h, 'GET', '/v1/wallet');
    assert.equal(r.status, 401);
  });

  test('a forged token is rejected', async () => {
    const h = await harness();
    await signUp(h);
    for (const forged of ['x', 'null', 'undefined', 'a'.repeat(43), '../../etc/passwd']) {
      const r = await call(h, 'GET', '/v1/wallet', { token: forged });
      assert.equal(r.status, 401, `token ${forged} was accepted`);
    }
  });

  test('a user id is not a credential', async () => {
    const h = await harness();
    const { userId } = await signUp(h);
    // The single most common IDOR shape: the server accepting an identifier
    // that was never proven. A user id is public to its owner and guessable in
    // bulk, so it must be worthless as a token.
    const r = await call(h, 'GET', '/v1/wallet', { token: userId });
    assert.equal(r.status, 401);
  });

  test('IDOR: a supplied user id cannot redirect a request to another account', async () => {
    const h = await harness();
    const a = await signUp(h, '+919000000001');
    h.advance(61_000);
    const b = await signUp(h, '+919000000002');

    // Give B a balance so the two wallets are distinguishable.
    await completeAlarmFor(h, b.token);
    await deliverSsv(h, b.userId);

    const bWallet = await call(h, 'GET', '/v1/wallet', { token: b.token });
    assert.notEqual(bWallet.body.lifetimeRupees, '0.00');

    // A asks for B's wallet every way a client can express it.
    for (const path of [
      `/v1/wallet?userId=${b.userId}`,
      `/v1/wallet?user_id=${b.userId}`,
      `/v1/wallet/${b.userId}`,
    ]) {
      const r = await call(h, 'GET', path, { token: a.token });
      if (r.status === 200) {
        assert.equal(r.body.lifetimeRupees, '0.00', `${path} leaked another account`);
      } else {
        assert.equal(r.status, 404);
      }
    }

    // And in a body, on the one authenticated endpoint that takes one.
    const payout = await call(h, 'POST', '/v1/payout', {
      token: a.token,
      body: { requestId: 'r1', vpaHash: 'v1', userId: b.userId, user_id: b.userId },
    });
    // A has no balance, so this must fail on A's state, never B's.
    assert.equal(payout.status, 409);
    assert.equal(payout.body.error, 'alarm_gate_not_met');
  });

  test('an expired session is refused', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    assert.equal((await call(h, 'GET', '/v1/wallet', { token })).status, 200);
    h.advance(SESSION_TTL_MS + 1);
    assert.equal((await call(h, 'GET', '/v1/wallet', { token })).status, 401);
  });

  test('logout revokes immediately, not at expiry', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    await call(h, 'POST', '/v1/auth/logout', { token });
    assert.equal((await call(h, 'GET', '/v1/wallet', { token })).status, 401);
  });

  test('deleting the account kills every live session', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    assert.equal((await call(h, 'DELETE', '/v1/account', { token })).status, 200);
    assert.equal((await call(h, 'GET', '/v1/wallet', { token })).status, 401);
  });

  test('the OTP endpoint is not a membership oracle', async () => {
    const h = await harness();
    await signUp(h, '+919000000001');
    h.advance(61_000);
    const known = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone: '+919000000001' } });
    const unknown = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone: '+919000000009' } });
    assert.equal(known.status, unknown.status);
    assert.deepEqual(known.body, unknown.body);
  });
});

/* ================================================================== responses */

describe('response hygiene', () => {
  test('every response carries the security headers, errors included', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    const replies = [
      await call(h, 'GET', '/v1/wallet', { token }),   // 200
      await call(h, 'GET', '/v1/wallet'),              // 401
      await call(h, 'GET', '/v1/nope'),                // 404
      await call(h, 'POST', '/v1/payout', { token, body: {} }), // 400
    ];
    for (const r of replies) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        assert.equal(r.headers[name.toLowerCase()], value,
          `${name} missing on a ${r.status}`);
      }
    }
  });

  test('no error body leaks a stack trace, a path or a hostname', async () => {
    const h = await harness();
    const replies = [
      await call(h, 'GET', '/v1/nope'),
      await call(h, 'GET', '/v1/wallet'),
      await call(h, 'GET', '/v1/ssv?garbage'),
      await call(h, 'POST', '/v1/auth/otp/request', { body: { phone: 'nope' } }),
    ];
    for (const r of replies) {
      assert.ok(r.body?.correlationId, 'no correlation id to trace this by');
      const text = r.text;
      for (const leak of ['at Object.', '/home/', '.ts:', 'node_modules', 'Error:', '127.0.0.1']) {
        assert.ok(!text.includes(leak), `error body leaked ${leak}: ${text}`);
      }
    }
  });

  test('CORS is never a wildcard, and unknown origins get nothing', async () => {
    const h = await harness();
    const r = await call(h, 'GET', '/v1/wallet', { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.headers['access-control-allow-origin'], undefined);

    const allowed = await harness({ allowedOrigins: ['https://alarmx.app'] });
    const ok = await call(allowed, 'GET', '/v1/wallet', {
      headers: { Origin: 'https://alarmx.app' },
    });
    assert.equal(ok.headers['access-control-allow-origin'], 'https://alarmx.app');
    assert.notEqual(ok.headers['access-control-allow-origin'], '*');
  });
});

/* ======================================================================= SSV */

describe('the SSV callback', () => {
  test('a replayed callback credits exactly once', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await completeAlarmFor(h, token);

    const query = h.signedQuery({ user_id: userId, transaction_id: 'tx-replay' });
    const first = await call(h, 'GET', `/v1/ssv?${query}`);
    const second = await call(h, 'GET', `/v1/ssv?${query}`);
    const third = await call(h, 'GET', `/v1/ssv?${query}`);

    // All 200: Google retries anything else, forever.
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);

    const credited = h.store.allLedger().filter((e) => e.rejectedFor === null);
    assert.equal(credited.length, 1, 'a replay was paid twice');
    const dupes = h.store.allLedger().filter((e) => e.rejectedFor === 'duplicate');
    assert.equal(dupes.length, 2, 'replays must still be audited');
  });

  test('one tampered character voids the callback and pays nothing', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await completeAlarmFor(h, token);

    const good = h.signedQuery({ user_id: userId, reward_amount: '1' });
    const tampered = good.replace('reward_amount=1', 'reward_amount=9999');

    const r = await call(h, 'GET', `/v1/ssv?${tampered}`);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'ssv_rejected');
    assert.equal(h.store.allLedger().length, 0, 'a forged callback reached the ledger');
    const wallet = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(wallet.body.lifetimeRupees, '0.00');
  });

  test('an unsigned callback is worthless', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await completeAlarmFor(h, token);

    for (const q of [
      `user_id=${userId}&transaction_id=t1&key_id=k1`,                       // no signature
      `user_id=${userId}&transaction_id=t1&key_id=k1&signature=AAAA`,        // junk signature
      `user_id=${userId}&transaction_id=t1&key_id=unknown&signature=AAAA`,   // unknown key
    ]) {
      const r = await call(h, 'GET', `/v1/ssv?${q}`);
      assert.equal(r.status, 400, `accepted: ${q}`);
    }
    assert.equal(h.store.allLedger().length, 0);
  });

  test('a callback for an unknown user creates nothing', async () => {
    const h = await harness();
    const r = await deliverSsv(h, 'no-such-user');
    assert.equal(r.status, 200, 'Google must not be told to retry forever');
    assert.equal(h.store.rawUser('no-such-user'), undefined,
      'an unauthenticated callback created an account');
    assert.equal(h.store.allLedger().length, 0);
  });

  test('no alarm today means no money, however many ads are watched', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    for (let i = 0; i < 5; i++) await deliverSsv(h, userId);

    const wallet = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(wallet.body.lifetimeRupees, '0.00');
    assert.ok(h.store.allLedger().every((e) => e.rejectedFor === 'alarm_not_completed'));
  });

  test('the daily ceiling holds at exactly 20', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await completeAlarmFor(h, token);

    for (let i = 0; i < DAILY_VIEW_CEILING + 5; i++) await deliverSsv(h, userId);

    const credited = h.store.allLedger().filter((e) => e.rejectedFor === null);
    assert.equal(credited.length, DAILY_VIEW_CEILING);
    const wallet = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(wallet.body.viewsToday, DAILY_VIEW_CEILING);
  });
});

/* ==================================================================== payouts */

describe('payouts', () => {
  /** Grind a user to a withdrawable balance the honest way: 7 days, 20 views. */
  async function grind(h: Harness, token: string, userId: string, days = 7): Promise<void> {
    for (let d = 0; d < days; d++) {
      if (d > 0) h.advance(24 * 60 * 60 * 1000);
      await completeAlarmFor(h, token);
      for (let i = 0; i < DAILY_VIEW_CEILING; i++) await deliverSsv(h, userId);
    }
  }

  test('a double-tapped withdrawal pays once', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await grind(h, token, userId);

    const before = await call(h, 'GET', '/v1/wallet', { token });
    assert.ok(Number(before.body.withdrawableRupees) >= 10, 'fixture did not reach the threshold');

    // Five genuinely concurrent requests, same request id.
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(h, 'POST', '/v1/payout', { token, body: { requestId: 'req-1', vpaHash: 'vpa-a' } })),
    );
    const paid = replies.filter((r) => r.status === 200);
    assert.equal(paid.length, 1, `${paid.length} payments for one request id`);
    assert.equal(h.store.allPayouts().length, 1);

    const after = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(after.body.withdrawableRupees, '0.00');
  });

  test('a second withdrawal cannot overdraw an emptied wallet', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await grind(h, token, userId);

    assert.equal((await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: 'req-1', vpaHash: 'vpa-a' },
    })).status, 200);

    const second = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: 'req-2', vpaHash: 'vpa-a' },
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'below_threshold');
    assert.equal(h.store.allPayouts().length, 1);
  });

  test('the client cannot name its own amount', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await grind(h, token, userId);
    const wallet = await call(h, 'GET', '/v1/wallet', { token });

    const r = await call(h, 'POST', '/v1/payout', {
      token,
      body: {
        requestId: 'req-1', vpaHash: 'vpa-a',
        amount: 999999, amountPaise: 999999, withdrawable: 999999, paidRupees: '9999.00',
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.paidRupees, wallet.body.withdrawableRupees,
      'a client-supplied amount changed the payment');
  });

  test('the seven-alarm-day gate blocks the first payout', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await grind(h, token, userId, 6);

    const r = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: 'req-1', vpaHash: 'vpa-a' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'alarm_gate_not_met');
  });

  test('a failed integrity check stops the money', async () => {
    const h = await harness({ requireIntegrity: true });
    const { token, userId } = await signUp(h);
    await grind(h, token, userId);

    h.integrity.passed = false;
    const r = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: 'req-1', vpaHash: 'vpa-a' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'integrity_failed');
    assert.equal(h.store.allPayouts().length, 0);
  });

  test('the integrity attestation is bound to the specific request', async () => {
    const h = await harness({ requireIntegrity: true });
    const { token, userId } = await signUp(h);
    await grind(h, token, userId);
    await call(h, 'POST', '/v1/payout', { token, body: { requestId: 'req-xyz', vpaHash: 'v' } });
    // A captured token replayed against a different withdrawal must not verify,
    // which is only possible if the nonce is the request id.
    assert.ok(h.integrity.nonces.includes('req-xyz'));
  });
});

/* ====================================================== limits and bad input */

describe('rate limits', () => {
  test('OTP requests stop at the documented per-number limit', async () => {
    const h = await harness();
    const phone = '+919000000001';
    for (let i = 0; i < RATE_LIMITS.otpPerNumber.max; i++) {
      const r = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
      assert.equal(r.status, 200, `request ${i + 1} was refused early`);
    }
    const over = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
    assert.equal(over.status, 429);
    assert.equal(h.otp.sent.length, RATE_LIMITS.otpPerNumber.max, 'an SMS was sent over the limit');
  });

  test('the limit does not reset itself when it starts working', async () => {
    const h = await harness();
    const phone = '+919000000001';
    for (let i = 0; i < RATE_LIMITS.otpPerNumber.max + 3; i++) {
      await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
    }
    // Rejected attempts are counted too, so hammering does not buy a reset.
    const stillBlocked = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
    assert.equal(stillBlocked.status, 429);
  });

  test('login attempts are capped per IP', async () => {
    const h = await harness();
    const body = { phone: '+919000000001', code: 'wrong' };
    let sawLimit = false;
    for (let i = 0; i < RATE_LIMITS.login.max + 2; i++) {
      const r = await call(h, 'POST', '/v1/auth/otp/verify', { body });
      if (r.status === 429) sawLimit = true;
    }
    assert.ok(sawLimit, 'unlimited OTP guesses were allowed');
  });

  test('the limit lifts once the window passes', async () => {
    const h = await harness();
    const phone = '+919000000001';
    for (let i = 0; i < RATE_LIMITS.otpPerNumber.max + 1; i++) {
      await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
    }
    h.advance(RATE_LIMITS.otpPerNumber.windowMs + 1000);
    const r = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
    assert.equal(r.status, 200, 'a legitimate user stayed locked out');
  });
});

describe('input handling', () => {
  test('an injection payload is not a phone number', async () => {
    const h = await harness();
    for (const phone of [
      "+91' OR '1'='1",
      "+919000000001'; DROP TABLE users;--",
      '+91<script>alert(1)</script>',
      '+91' + '9'.repeat(200),
    ]) {
      const r = await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
      assert.equal(r.status, 400, `accepted ${phone}`);
    }
    assert.equal(h.otp.sent.length, 0);
  });

  test('a payload in an opaque field is stored as a literal, not executed', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    for (let d = 0; d < 7; d++) {
      if (d > 0) h.advance(24 * 60 * 60 * 1000);
      await completeAlarmFor(h, token);
      for (let i = 0; i < DAILY_VIEW_CEILING; i++) await deliverSsv(h, userId);
    }
    const nasty = "'; DROP TABLE payouts;--";
    const r = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: nasty, vpaHash: 'vpa-a' },
    });
    assert.equal(r.status, 200);
    assert.equal(h.store.allPayouts()[0]?.requestId, nasty, 'the value was altered in transit');
    // And it is still just a string: replaying it is a duplicate, not a second payment.
    const again = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: nasty, vpaHash: 'vpa-a' },
    });
    assert.equal(again.status, 409);
    assert.equal(h.store.allPayouts().length, 1);
  });

  test('an oversized body is refused before it is buffered', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    const r = await call(h, 'POST', '/v1/payout', {
      token, body: { requestId: 'r', vpaHash: 'v', junk: 'x'.repeat(64 * 1024) },
    });
    assert.equal(r.status, 413);
  });

  test('a non-JSON body is refused', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    const res = await fetch(`${h.url}/v1/payout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: 'requestId=r',
    });
    assert.equal(res.status, 415);
  });

  test('malformed JSON is refused without detail', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    const res = await fetch(`${h.url}/v1/payout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{"requestId":',
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'malformed_json');
  });

  test('a missing required field is a 400, not a 500', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    for (const body of [{}, { requestId: 'r' }, { requestId: '', vpaHash: 'v' }, { requestId: 1, vpaHash: 'v' }]) {
      const r = await call(h, 'POST', '/v1/payout', { token, body });
      assert.equal(r.status, 400, `${JSON.stringify(body)} produced ${r.status}`);
    }
  });
});

/* ================================================================= day gaming */

describe('day boundaries', () => {
  test('the ceiling does not reset until a real day has passed', async () => {
    const h = await harness();
    const { token, userId } = await signUp(h);
    await completeAlarmFor(h, token);
    for (let i = 0; i < DAILY_VIEW_CEILING; i++) await deliverSsv(h, userId);

    // Nineteen hours later is still the same earning day by PRD 18.4.
    h.advance(19 * 60 * 60 * 1000);
    await deliverSsv(h, userId);
    const credited = h.store.allLedger().filter((e) => e.rejectedFor === null);
    assert.equal(credited.length, DAILY_VIEW_CEILING, 'the ceiling reset too early');

    // A full day later it does reset — and still needs a fresh alarm first.
    h.advance(6 * 60 * 60 * 1000);
    await deliverSsv(h, userId);
    const stillCapped = h.store.allLedger().filter((e) => e.rejectedFor === null);
    assert.equal(stillCapped.length, DAILY_VIEW_CEILING, 'earning resumed without an alarm');

    await completeAlarmFor(h, token);
    await deliverSsv(h, userId);
    const afterAlarm = h.store.allLedger().filter((e) => e.rejectedFor === null);
    assert.equal(afterAlarm.length, DAILY_VIEW_CEILING + 1);
  });

  test('the streak breaks when a day is skipped', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    await completeAlarmFor(h, token);
    h.advance(24 * 60 * 60 * 1000);
    await completeAlarmFor(h, token);
    let wallet = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(wallet.body.streakDays, 2);

    h.advance(2 * 24 * 60 * 60 * 1000);   // missed a day
    await completeAlarmFor(h, token);
    wallet = await call(h, 'GET', '/v1/wallet', { token });
    assert.equal(wallet.body.streakDays, 1);
  });

  test('completing the alarm twice in a day counts once', async () => {
    const h = await harness();
    const { token } = await signUp(h);
    const first = await completeAlarmFor(h, token);
    const second = await completeAlarmFor(h, token);
    assert.equal(first.body.firstToday, true);
    assert.equal(second.body.firstToday, false);
    assert.equal(second.body.streakDays, 1);
  });
});

/* ================================================================ end to end */

test('a full honest week: alarm, ads, receipt, withdrawal', async () => {
  const h = await startHarness();
  open.push(h);
  const { token, userId } = await signUp(h);

  for (let day = 0; day < 7; day++) {
    if (day > 0) h.advance(24 * 60 * 60 * 1000);
    await completeAlarmFor(h, token);
    for (let i = 0; i < DAILY_VIEW_CEILING; i++) await deliverSsv(h, userId);

    const close = await call(h, 'GET', '/v1/day/close', { token });
    assert.equal(close.status, 200);
    assert.equal(close.body.creditedViews, DAILY_VIEW_CEILING);
    assert.equal(close.body.streakDays, day + 1);
    assert.ok(Number(close.body.earnedRupees) > 0, 'a full day of ads earned nothing');
  }

  const wallet = await call(h, 'GET', '/v1/wallet', { token });
  assert.equal(wallet.body.distinctAlarmDays, 7);

  const paid = await call(h, 'POST', '/v1/payout', {
    token, body: { requestId: 'week-1', vpaHash: 'vpa-a' },
  });
  assert.equal(paid.status, 200, `withdrawal refused: ${paid.text}`);
  assert.equal(paid.body.paidRupees, wallet.body.withdrawableRupees);

  // The receipt is summed from the ledger, so it must equal what was paid over
  // the week. If these ever disagree, the app is lying to the user.
  const ledgerTotal = h.store.allLedger().reduce((sum, e) => sum + e.credited, 0n);
  assert.equal(`${ledgerTotal / 100n}.${(ledgerTotal % 100n).toString().padStart(2, '0')}`,
    paid.body.paidRupees);
});
