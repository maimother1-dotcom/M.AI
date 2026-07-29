import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from '../config';
import type { IntegrityVerifier, OtpProvider, RevenueSource } from '../providers';
import type { VerifierKey } from '../ssv';
import type { Store } from '../store';

export interface Ctx {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly body: Record<string, unknown>;
  /** Raw, un-normalised query string. SSV signatures are over these exact bytes. */
  readonly rawQuery: string;
  readonly ip: string;
}

/**
 * Everything the handlers need, injected.
 *
 * `clock` is a function so tests can drive time forward across day boundaries
 * and rate-limit windows without sleeping. Nothing in the request path ever
 * calls Date.now() directly — a device clock is untrusted, and so is an
 * untestable server clock.
 */
export interface Deps {
  readonly store: Store;
  readonly clock: () => number;
  readonly ssvKeys: () => Promise<readonly VerifierKey[]>;
  readonly integrity: IntegrityVerifier;
  readonly otp: OtpProvider;
  readonly revenue: RevenueSource;
  readonly config: Config;
  /** Detail goes here and never to the client. PRD 18.5. */
  readonly log: (event: string, fields: Record<string, unknown>) => void;
}
