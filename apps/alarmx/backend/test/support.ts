/**
 * Test harness: a real server on a real socket, driven by real HTTP requests.
 *
 * The point of going to this trouble rather than calling handlers directly is
 * that the attacks worth testing live in the gap between "the function is
 * correct" and "the request reaches the function": a missing auth check, a
 * header set on one path only, an identity read from the wrong place. None of
 * those are visible from a unit test.
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { configFromEnv, type Config } from '../src/config';
import { createApp } from '../src/http/server';
import type { Deps } from '../src/http/types';
import type { IntegrityVerdict, IntegrityVerifier, OtpProvider } from '../src/providers';
import { StaticRevenueSource } from '../src/providers';
import { VIEW_GROSS_MICROPAISE } from '../src/money';
import type { VerifierKey } from '../src/ssv';
import { MemoryStore } from '../src/store/memory';

export const VALID_OTP = '424242';
/** 1st June 2026, 03:30 UTC = 09:00 IST. A plausible alarm time. */
export const T0 = Date.UTC(2026, 5, 1, 3, 30, 0);

export const TEST_PEPPER = 'test-pepper-that-is-long-enough-to-pass-32';

class FakeOtp implements OtpProvider {
  sent: string[] = [];
  async send(phone: string): Promise<void> { this.sent.push(phone); }
  async check(_phone: string, code: string): Promise<boolean> { return code === VALID_OTP; }
}

export class FakeIntegrity implements IntegrityVerifier {
  passed = true;
  deviceHash = 'device-1';
  /** Records the nonce it was asked to bind to, so replay binding is testable. */
  nonces: string[] = [];
  async verify(token: string | null, expectedNonce: string): Promise<IntegrityVerdict> {
    this.nonces.push(expectedNonce);
    if (!this.passed) return { passed: false, deviceHash: null, reason: 'test' };
    return { passed: true, deviceHash: token === null ? this.deviceHash : `${this.deviceHash}` };
  }
}

export interface Harness {
  readonly url: string;
  readonly store: MemoryStore;
  readonly otp: FakeOtp;
  readonly integrity: FakeIntegrity;
  readonly keys: VerifierKey[];
  now: number;
  /** Move server time forward. Nothing in the request path calls Date.now(). */
  advance(ms: number): void;
  signedQuery(overrides?: Record<string, string>): string;
  close(): Promise<void>;
  logs: Array<{ event: string; fields: Record<string, unknown> }>;
}

export async function startHarness(overrides: Partial<Config> = {}): Promise<Harness> {
  const store = new MemoryStore();
  const otp = new FakeOtp();
  const integrity = new FakeIntegrity();
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keys: VerifierKey[] = [
    { keyId: 'k1', pem: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
  ];

  const base = configFromEnv({ ALARMX_PHONE_PEPPER: TEST_PEPPER } as NodeJS.ProcessEnv);
  const config: Config = { ...base, requireIntegrity: false, ...overrides };

  const state = { now: T0 };
  const deps: Deps = {
    store,
    clock: () => state.now,
    ssvKeys: async () => keys,
    integrity,
    otp,
    revenue: new StaticRevenueSource(VIEW_GROSS_MICROPAISE),
    config,
    log: (event, fields) => { logs.push({ event, fields }); },
  };

  const server = createApp(deps);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    store, otp, integrity, keys, logs,
    get now() { return state.now; },
    set now(v: number) { state.now = v; },
    advance(ms) { state.now += ms; },
    signedQuery(overrides: Record<string, string> = {}) {
      const params: Record<string, string> = {
        ad_network: '5450213213286189855',
        reward_amount: '1',
        reward_item: 'coins',
        timestamp: String(state.now),
        transaction_id: `tx-${Math.random().toString(36).slice(2)}`,
        user_id: 'unset',
        key_id: 'k1',
        ...overrides,
      };
      const content = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
      const signer = createSign('SHA256');
      signer.update(content);
      signer.end();
      return `${content}&signature=${signer.sign(privateKey).toString('base64url')}`;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface Reply {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: any;
  readonly text: string;
}

export async function call(
  h: Harness,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let payload: string | undefined;
  if (opts.body !== undefined) {
    payload = JSON.stringify(opts.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const res = await fetch(`${h.url}${path}`, {
    method,
    headers,
    ...(payload !== undefined ? { body: payload } : {}),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* non-JSON is itself a finding */ }
  return {
    status: res.status,
    headers: Object.fromEntries([...res.headers.entries()]),
    body,
    text,
  };
}

/** Sign up and return a live session token. */
export async function signUp(
  h: Harness,
  phone = '+919876543210',
): Promise<{ token: string; userId: string }> {
  await call(h, 'POST', '/v1/auth/otp/request', { body: { phone } });
  const r = await call(h, 'POST', '/v1/auth/otp/verify', {
    body: { phone, code: VALID_OTP, utcOffsetMinutes: 330 },
  });
  if (r.status !== 200) throw new Error(`signup failed: ${r.status} ${r.text}`);
  const user = await h.store.findByPhoneHash(
    (await import('../src/http/handlers')).hashPhone(phone, TEST_PEPPER),
  );
  return { token: r.body.token as string, userId: user!.userId };
}

/** Complete the alarm, which is what unlocks earning for the day. */
export async function completeAlarmFor(h: Harness, token: string): Promise<Reply> {
  return call(h, 'POST', '/v1/alarm/complete', { token });
}

/** Deliver one verified AdMob callback for a user. */
export async function deliverSsv(
  h: Harness,
  userId: string,
  overrides: Record<string, string> = {},
): Promise<Reply> {
  const q = h.signedQuery({ user_id: userId, ...overrides });
  return call(h, 'GET', `/v1/ssv?${q}`);
}
