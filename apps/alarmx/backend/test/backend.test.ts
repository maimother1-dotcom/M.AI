import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MICROPAISE_PER_PAISA, VIEW_GROSS_MICROPAISE, ZERO,
  formatPaise, roundWithCarry, rupeesToPaise, subtract,
} from '../src/money';
import { verifySsv, idempotencyKey, MAX_CALLBACK_AGE_MS, VerifierKey } from '../src/ssv';
import {
  credit, tierFor, entitlementMicropaise, DAILY_VIEW_CEILING,
  SHARE_BASIS_POINTS, UserState,
} from '../src/reward';
import {
  DayBoundary, mayChangeTimezone, evaluateReferral, evaluatePayout,
  withinRateLimit, RATE_LIMITS, MIN_DAY_GAP_MS, MAX_PAID_REFERRALS_PER_MONTH,
} from '../src/integrity';

const NOW = 1_800_000_000_000;
const IST = new DayBoundary(330);
const TODAY = IST.dayIndex(NOW);

const ready: UserState = {
  lifetimeEarned: rupeesToPaise(20),
  withdrawable: ZERO,
  streakDays: 0,
  carryMicropaise: 0n,
  alarmCompletedForDay: TODAY,
  creditedViewsToday: 0,
  spinBonusBasisPoints: 0,
  underReview: false,
};

describe('money', () => {
  test('one view is exactly 10.56 paise, no float needed', () => {
    assert.equal(VIEW_GROSS_MICROPAISE, 10_560n);
    assert.equal(MICROPAISE_PER_PAISA, 1000n);
  });

  test('rounding is downward, and the remainder is carried', () => {
    const r = roundWithCarry(5_280n, 0n);      // 5.28 paise
    assert.equal(r.paise, 5n);                 // never 6
    assert.equal(r.carry, 280n);
  });

  test('the carry pays out once it reaches a whole paisa', () => {
    let carry = 0n, total = 0n;
    for (let i = 0; i < 25; i++) {
      const r = roundWithCarry(5_280n, carry);
      total += r.paise; carry = r.carry;
    }
    assert.equal(total, 132n);   // 25 x 5.28 = 132.00 paise exactly
    assert.equal(carry, 0n);
  });

  test('never overpays at any prefix of a long stream', () => {
    let carry = 0n, paid = 0n, entitled = 0n;
    for (let i = 0; i < 5000; i++) {
      entitled += 5_280n;
      const r = roundWithCarry(5_280n, carry);
      paid += r.paise; carry = r.carry;
      assert.ok(paid <= entitled / MICROPAISE_PER_PAISA, `overpaid at step ${i}`);
    }
    assert.ok(entitled / MICROPAISE_PER_PAISA - paid < 1n, 'lost more than a paisa');
  });

  test('a payout cannot overdraw', () => {
    assert.throws(() => subtract(500n, 501n), RangeError);
  });

  test('formatting is display only and never negative', () => {
    assert.equal(formatPaise(1234n), '12.34');
    assert.throws(() => formatPaise(-1n), RangeError);
  });
});

describe('SSV — the only credit trigger', () => {
  // A real EC keypair, so this is a genuine signature round-trip rather than a
  // mock that would pass whatever we fed it.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys: VerifierKey[] = [{ keyId: 'k1', pem }];

  function signedQuery(overrides: Record<string, string> = {}): string {
    const params: Record<string, string> = {
      ad_network: '5450213213286189855',
      reward_amount: '1',
      reward_item: 'coins',
      timestamp: String(NOW),
      transaction_id: 'tx-abc-123',
      user_id: 'user-42',
      key_id: 'k1',
      ...overrides,
    };
    const content = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const signer = createSign('SHA256');
    signer.update(content);
    signer.end();
    const sig = signer.sign(privateKey).toString('base64url');
    return `${content}&signature=${sig}`;
  }

  test('a correctly signed callback verifies', () => {
    const v = verifySsv(signedQuery(), keys, NOW);
    assert.equal(v.verified, true);
    assert.equal(v.userId, 'user-42');
    assert.equal(v.transactionId, 'tx-abc-123');
  });

  test('a tampered parameter fails — this is the whole safety property', () => {
    const q = signedQuery();
    const tampered = q.replace('reward_amount=1', 'reward_amount=9999');
    const v = verifySsv(tampered, keys, NOW);
    assert.equal(v.verified, false);
    assert.equal(v.reason, 'bad_signature');
  });

  test('a forged signature fails', () => {
    const q = signedQuery();
    const forged = q.slice(0, q.lastIndexOf('&signature=')) + '&signature=AAAA';
    assert.equal(verifySsv(forged, keys, NOW).verified, false);
  });

  test('no signature at all fails', () => {
    assert.equal(verifySsv('user_id=x&transaction_id=y', keys, NOW).reason, 'missing_signature');
  });

  test('an unknown key id fails rather than being trusted', () => {
    const v = verifySsv(signedQuery({ key_id: 'rotated-away' }), keys, NOW);
    assert.equal(v.reason, 'unknown_key_id');
  });

  test('a stale callback is refused, bounding replay across key rotation', () => {
    const v = verifySsv(signedQuery(), keys, NOW + MAX_CALLBACK_AGE_MS + 1000);
    assert.equal(v.reason, 'stale_callback');
  });

  test('a callback with no user id is refused', () => {
    // Signed correctly but semantically useless: we must not credit "somebody".
    const v = verifySsv(signedQuery({ user_id: '' }), keys, NOW);
    assert.equal(v.verified, false);
  });

  test('the idempotency key is stable and user-scoped', () => {
    assert.equal(idempotencyKey('u1', 't1'), idempotencyKey('u1', 't1'));
    assert.notEqual(idempotencyKey('u1', 't1'), idempotencyKey('u2', 't1'));
  });
});

describe('reward engine', () => {
  const base = {
    grossMicropaise: VIEW_GROSS_MICROPAISE,
    idempotencyKey: 'k1',
    alreadySeen: false,
    dayIndex: TODAY,
  };

  test('an unverified view credits nothing', () => {
    const out = credit({ ...base, state: ready, verified: false });
    assert.equal(out.kind, 'rejected');
    assert.equal(out.state.withdrawable, ZERO);
    assert.equal(out.entry.rejectedFor, 'not_verified');
  });

  test('a verified view credits the share, rounded down', () => {
    const out = credit({ ...base, state: ready, verified: true });
    assert.equal(out.kind, 'credited');
    assert.equal(out.state.withdrawable, 5n);      // 5.28 paise -> 5
    assert.equal(out.state.carryMicropaise, 280n);
  });

  test('a replayed callback credits once', () => {
    const first = credit({ ...base, state: ready, verified: true });
    const second = credit({ ...base, state: first.state, verified: true, alreadySeen: true });
    assert.equal(second.kind, 'rejected');
    assert.equal(second.state.withdrawable, first.state.withdrawable);
  });

  test('earning is locked until the alarm is completed that day', () => {
    const stale = { ...ready, alarmCompletedForDay: TODAY - 1 };
    const out = credit({ ...base, state: stale, verified: true });
    assert.equal(out.kind, 'rejected');
    assert.equal(out.entry.rejectedFor, 'alarm_not_completed');
  });

  test('the daily ceiling holds at 20', () => {
    let state = ready, credited = 0;
    for (let i = 0; i < 40; i++) {
      const out = credit({ ...base, state, verified: true, idempotencyKey: `k${i}` });
      state = out.state;
      if (out.kind === 'credited') credited++;
    }
    assert.equal(credited, DAILY_VIEW_CEILING);
  });

  test('an account under review earns nothing', () => {
    const out = credit({ ...base, state: { ...ready, underReview: true }, verified: true });
    assert.equal(out.entry.rejectedFor, 'account_under_review');
  });

  test('zero realised revenue pays zero, even on the jackpot multiplier', () => {
    const out = credit({
      ...base, state: { ...ready, spinBonusBasisPoints: 10_000 },
      verified: true, grossMicropaise: 0n,
    });
    assert.equal(out.kind, 'credited');
    assert.equal(out.kind === 'credited' && out.amount, ZERO);
  });

  test('halving the realised value halves the payout', () => {
    const run = (gross: bigint) => {
      let state = ready;
      for (let i = 0; i < 10; i++) {
        state = credit({ ...base, state, verified: true, grossMicropaise: gross, idempotencyKey: `k${i}` }).state;
      }
      return state.withdrawable;
    };
    const full = run(VIEW_GROSS_MICROPAISE);
    const half = run(VIEW_GROSS_MICROPAISE / 2n);
    assert.ok(full - half * 2n <= 1n && half * 2n - full <= 1n, `${full} vs ${half}`);
  });

  test('tiers follow lifetime earnings then streak', () => {
    assert.equal(tierFor(rupeesToPaise(9), 30), 'ACQUISITION');
    assert.equal(tierFor(rupeesToPaise(20), 0), 'BASE');
    assert.equal(tierFor(rupeesToPaise(20), 7), 'STREAK_7');
    assert.equal(tierFor(rupeesToPaise(20), 30), 'STREAK_30');
  });

  test('randomised — never pays more than was entitled', () => {
    let seed = 20260726;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let trial = 0; trial < 200; trial++) {
      let state: UserState = { ...ready, streakDays: rnd(60), spinBonusBasisPoints: [0, 1000, 4000, 10000][rnd(4)]! };
      let entitled = 0n;
      for (let i = 0; i < DAILY_VIEW_CEILING; i++) {
        const verified = rnd(10) > 2;
        const gross = BigInt(rnd(30_000));
        const tier = tierFor(state.lifetimeEarned, state.streakDays);
        const out = credit({
          state, verified, grossMicropaise: gross,
          idempotencyKey: `t${trial}-${i}`, alreadySeen: false, dayIndex: TODAY,
        });
        if (out.kind === 'credited') {
          entitled += entitlementMicropaise(gross, tier, state.spinBonusBasisPoints);
        }
        state = out.state;
      }
      assert.ok(state.withdrawable * MICROPAISE_PER_PAISA <= entitled, `trial ${trial} overpaid`);
    }
  });
});

describe('day boundary (PRD 18.4)', () => {
  test('a rollover minutes later is refused', () => {
    assert.equal(IST.mayRollOver(NOW, NOW + 60_000), false);
  });

  test('8am Monday then 7am Tuesday is two days', () => {
    assert.equal(IST.mayRollOver(NOW, NOW + 23 * 3_600_000), true);
  });

  test('19 hours refused, 20 allowed', () => {
    assert.equal(IST.mayRollOver(NOW, NOW + 19 * 3_600_000), false);
    assert.equal(IST.mayRollOver(NOW, NOW + MIN_DAY_GAP_MS), true);
  });

  test('a clock running backwards is refused', () => {
    assert.equal(IST.mayRollOver(NOW, NOW - 3_600_000), false);
  });

  test('changing the pinned timezone is rate limited', () => {
    assert.equal(mayChangeTimezone(null, 100), true);
    assert.equal(mayChangeTimezone(100, 105), false);
    assert.equal(mayChangeTimezone(100, 114), true);
  });

  test('an implausible offset is rejected', () => {
    assert.throws(() => new DayBoundary(999), RangeError);
  });
});

describe('referral (PRD 18.7)', () => {
  const good = {
    referrerUserId: 'a', refereeUserId: 'b',
    referrerDeviceHash: 'dev-a', refereeDeviceHash: 'dev-b',
    referrerVpaHash: 'vpa-a', refereeVpaHash: 'vpa-b',
    refereeHasBeenPaidOut: true, refereeAlarmDays: 7,
    pairAlreadyPaid: false, referrerPaidThisMonth: 0,
  };

  test('a genuine referral is paid', () => {
    assert.deepEqual(evaluateReferral(good), { ok: true });
  });

  test('self-referral is blocked', () => {
    const r = evaluateReferral({ ...good, refereeUserId: 'a' });
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, 'self_referral');
  });

  test('same device is blocked even with different accounts', () => {
    const r = evaluateReferral({ ...good, refereeDeviceHash: 'dev-a' });
    assert.equal((r as { reason: string }).reason, 'same_device');
  });

  test('same payment instrument is blocked', () => {
    const r = evaluateReferral({ ...good, refereeVpaHash: 'vpa-a' });
    assert.equal((r as { reason: string }).reason, 'same_payment_instrument');
  });

  test('the referee must have been paid out on their own first', () => {
    const r = evaluateReferral({ ...good, refereeHasBeenPaidOut: false });
    assert.equal((r as { reason: string }).reason, 'referee_not_paid_out');
  });

  test('the referee must clear the 7 alarm-day gate', () => {
    const r = evaluateReferral({ ...good, refereeAlarmDays: 6 });
    assert.equal((r as { reason: string }).reason, 'referee_gate_not_met');
  });

  test('a device pair is paid once, ever', () => {
    const r = evaluateReferral({ ...good, pairAlreadyPaid: true });
    assert.equal((r as { reason: string }).reason, 'pair_already_paid');
  });

  test('referral volume is capped per month', () => {
    const r = evaluateReferral({ ...good, referrerPaidThisMonth: MAX_PAID_REFERRALS_PER_MONTH });
    assert.equal((r as { reason: string }).reason, 'monthly_cap');
  });
});

describe('payout (PRD 6.1, 6.3, 18.8)', () => {
  const req = {
    withdrawable: 1000n, hasWithdrawnEver: false, distinctAlarmDays: 7,
    playIntegrityPassed: true, underReview: false,
    requestId: 'r1', requestIdAlreadyUsed: false,
  };

  test('a first payout at Rs10 past the gate succeeds, in full', () => {
    const out = evaluatePayout(req);
    assert.equal(out.ok, true);
    assert.equal((out as { amount: bigint }).amount, 1000n);
    assert.equal((out as { remaining: bigint }).remaining, 0n, 'no monthly release limit, ever');
  });

  test('the 7 alarm-day gate blocks the first payout', () => {
    const out = evaluatePayout({ ...req, distinctAlarmDays: 6 });
    assert.equal((out as { reason: string }).reason, 'alarm_gate_not_met');
  });

  test('failing Play Integrity blocks the payout', () => {
    assert.equal((evaluatePayout({ ...req, playIntegrityPassed: false }) as { reason: string }).reason,
      'integrity_failed');
  });

  test('a duplicate request id pays once — a double tap cannot double pay', () => {
    assert.equal((evaluatePayout({ ...req, requestIdAlreadyUsed: true }) as { reason: string }).reason,
      'duplicate_request');
  });

  test('the later threshold is Rs30', () => {
    assert.equal((evaluatePayout({ ...req, hasWithdrawnEver: true, withdrawable: 2999n }) as { reason: string }).reason,
      'below_threshold');
    assert.equal(evaluatePayout({ ...req, hasWithdrawnEver: true, withdrawable: 3000n }).ok, true);
  });

  test('an account under review cannot withdraw', () => {
    assert.equal((evaluatePayout({ ...req, underReview: true }) as { reason: string }).reason, 'under_review');
  });
});

describe('rate limits (PRD 18.6)', () => {
  test('OTP is limited per number — SMS is a real bill', () => {
    const hits = [NOW - 1000, NOW - 2000, NOW - 3000];
    assert.equal(withinRateLimit(hits, RATE_LIMITS.otpPerNumber, NOW), false);
    assert.equal(withinRateLimit(hits.slice(0, 2), RATE_LIMITS.otpPerNumber, NOW), true);
  });

  test('old hits fall out of the window', () => {
    const old = [NOW - 2 * RATE_LIMITS.otpPerNumber.windowMs];
    assert.equal(withinRateLimit(old, RATE_LIMITS.otpPerNumber, NOW), true);
  });
});

describe('parity with the Kotlin core', () => {
  // The Android app renders an optimistic figure using the same rules. If the
  // two ever disagree, users see one number and get paid another.
  // __dirname is dist/test at runtime, so climb out of dist/ as well as test/.
  const kotlinDir = join(
    __dirname, '..', '..', '..', 'android', 'core', 'src', 'main', 'kotlin', 'com', 'alarmx', 'core',
  );
  const money = readFileSync(join(kotlinDir, 'Money.kt'), 'utf8');
  const share = readFileSync(join(kotlinDir, 'Share.kt'), 'utf8');
  const engine = readFileSync(join(kotlinDir, 'RewardEngine.kt'), 'utf8');
  const day = readFileSync(join(kotlinDir, 'DayBoundary.kt'), 'utf8');

  test('micropaise resolution matches', () => {
    assert.match(money, /MICROPAISE_PER_PAISA = 1000L/);
  });

  test('the gross value of a view matches', () => {
    assert.match(money, /VIEW_GROSS_MICROPAISE = 10_560L/);
  });

  test('every share tier matches', () => {
    assert.match(share, new RegExp(`BASE\\(${SHARE_BASIS_POINTS.BASE}\\)`));
    assert.match(share, new RegExp(`STREAK_7\\(${SHARE_BASIS_POINTS.STREAK_7}\\)`));
    assert.match(share, new RegExp(`STREAK_30\\(${SHARE_BASIS_POINTS.STREAK_30}\\)`));
    assert.match(share, new RegExp(`ACQUISITION\\(${SHARE_BASIS_POINTS.ACQUISITION}\\)`));
  });

  test('the daily view ceiling matches', () => {
    assert.match(engine, new RegExp(`DAILY_VIEW_CEILING = ${DAILY_VIEW_CEILING}`));
  });

  test('the minimum day gap matches', () => {
    assert.match(day, /MIN_DAY_GAP_MILLIS = 20 \* 60 \* 60 \* 1000L/);
    assert.equal(MIN_DAY_GAP_MS, 20 * 60 * 60 * 1000);
  });
});
