/**
 * The things that must be true of every response, and every request body.
 * PRD 18.5, 18.6, 18.9.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RateLimitRule, withinRateLimit } from '../integrity';
import { Store } from '../store';

/**
 * PRD 18.9. Applied to *every* response including errors and 404s, because a
 * header set on the happy path only is a header an attacker routes around.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // The API returns JSON and nothing else. It never needs to load anything.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  // Balances and receipts must not sit in an intermediary cache.
  'Cache-Control': 'no-store',
};

/** Bodies are small by design. 16 KB is generous for the largest of them. */
export const MAX_BODY_BYTES = 16 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/**
 * PRD 18.5: a client gets a code and a correlation id, never detail. Stack
 * traces, query text, file paths and hostnames go to the server log only.
 */
export function sendError(res: ServerResponse, status: number, code: string): string {
  const correlationId = randomUUID();
  send(res, status, { error: code, correlationId });
  return correlationId;
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, bigintReplacer);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.statusCode = status;
  res.end(payload);
}

/** Paise are bigint. Serialise as a string so no consumer parses them as float. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Read a JSON body, bounded.
 *
 * The size check runs **as bytes arrive**, not after buffering, so an attacker
 * cannot make the process hold a gigabyte before being told no.
 */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      // Drain the rest rather than destroying the socket. Destroying it means
      // the client sees a connection reset instead of the 413 explaining what
      // happened, which is both unhelpful and indistinguishable from a crash.
      req.resume();
      throw new HttpError(413, 'body_too_large');
    }
    chunks.push(buf);
  }
  if (size === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'malformed_json');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'malformed_json');
  }
  return parsed as Record<string, unknown>;
}

/**
 * CORS, allowlisted. Never `*` — PRD 18.9.
 *
 * The Android client does not use CORS at all, so an empty allowlist (the
 * default) is the correct production configuration and results in no CORS
 * headers being sent to anyone.
 */
export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: readonly string[],
): void {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
}

/**
 * Consume one unit of a rate limit, returning false when the caller is over.
 *
 * Reuses `withinRateLimit` from integrity.ts rather than reimplementing the
 * window. A hit is recorded on **rejected** attempts too: otherwise the limit
 * resets itself the moment it starts working.
 */
export async function consumeRateLimit(
  store: Store,
  subject: string,
  rule: RateLimitRule,
  nowMs: number,
): Promise<boolean> {
  const hits = await store.recentHits(subject, nowMs - rule.windowMs);
  const allowed = withinRateLimit(hits, rule, nowMs);
  await store.recordRateHit(subject, nowMs);
  return allowed;
}

/**
 * The client IP for rate limiting.
 *
 * `X-Forwarded-For` is only trusted when the deployment says it sits behind a
 * proxy, and only the **last** hop is taken, because everything a client sends
 * before that is attacker-controlled and would otherwise let one host mint
 * unlimited identities.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const raw = Array.isArray(header) ? header.join(',') : header;
    if (raw) {
      const hops = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const last = hops[hops.length - 1];
      if (last) return last;
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}
