/**
 * Dispatch.
 *
 * The route table is the security boundary: `auth: true` is the *only* way a
 * handler ever learns a user id, and the router is the only place that resolves
 * one. A new endpoint cannot accidentally ship unauthenticated, because an
 * authed handler's type signature demands a `userId` the router alone can
 * supply.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as h from './handlers';
import { HttpError, applyCors, clientIp, readJsonBody, sendError } from './guard';
import { resolveSession } from './session';
import type { Ctx, Deps } from './types';

type PublicHandler = (ctx: Ctx, deps: Deps) => Promise<void>;
type AuthedHandler = (ctx: Ctx, deps: Deps, userId: string) => Promise<void>;

interface Route {
  readonly method: string;
  readonly path: string;
  readonly auth: boolean;
  readonly body: boolean;
  readonly handler: PublicHandler | AuthedHandler;
}

const ROUTES: readonly Route[] = [
  { method: 'POST',   path: '/v1/auth/otp/request', auth: false, body: true,  handler: h.otpRequest },
  { method: 'POST',   path: '/v1/auth/otp/verify',  auth: false, body: true,  handler: h.otpVerify },
  { method: 'POST',   path: '/v1/auth/logout',      auth: false, body: false, handler: h.logout },
  { method: 'GET',    path: '/v1/ssv',              auth: false, body: false, handler: h.ssvCallback },
  { method: 'POST',   path: '/v1/alarm/complete',   auth: true,  body: false, handler: h.alarmComplete },
  { method: 'GET',    path: '/v1/wallet',           auth: true,  body: false, handler: h.wallet },
  { method: 'GET',    path: '/v1/day/close',        auth: true,  body: false, handler: h.dailyClose },
  { method: 'POST',   path: '/v1/payout',           auth: true,  body: true,  handler: h.payout },
  { method: 'DELETE', path: '/v1/account',          auth: true,  body: false, handler: h.deleteAccount },
];

export async function handle(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  try {
    applyCors(req, res, deps.config.allowedOrigins);

    const rawUrl = req.url ?? '/';
    const qIndex = rawUrl.indexOf('?');
    const path = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;
    const rawQuery = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return void res.end();
    }

    const route = ROUTES.find((r) => r.method === req.method && r.path === path);
    if (!route) return void sendError(res, 404, 'not_found');

    const ctx: Ctx = {
      req, res, rawQuery,
      body: route.body ? await readJsonBody(req) : {},
      ip: clientIp(req, deps.config.trustProxy),
    };

    if (route.auth) {
      const userId = await resolveSession(deps.store, req.headers.authorization, deps.clock());
      if (!userId) return void sendError(res, 401, 'unauthorized');
      await (route.handler as AuthedHandler)(ctx, deps, userId);
    } else {
      await (route.handler as PublicHandler)(ctx, deps);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return void sendError(res, err.status, err.code);
    }
    // Anything unexpected: the client gets a code and an id, the log gets the
    // truth. PRD 18.5 — no stack trace, path or hostname ever leaves here.
    const correlationId = sendError(res, 500, 'internal_error');
    deps.log('unhandled_error', {
      correlationId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
