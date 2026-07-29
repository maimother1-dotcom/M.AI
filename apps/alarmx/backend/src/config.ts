/**
 * Configuration. Nothing here has a default that would be unsafe in production.
 */

export interface Config {
  /**
   * HMAC key for phone-number hashing.
   *
   * A phone number is ten digits. A plain SHA-256 of one is reversible by
   * brute force in seconds on a laptop, so hashing without a secret key gives
   * the *appearance* of protecting the identifier while protecting nothing.
   * Required, with no default, because a default would silently become the
   * production value.
   */
  readonly phonePepper: string;
  readonly allowedOrigins: readonly string[];
  /** Only true when the process genuinely sits behind a known proxy. */
  readonly trustProxy: boolean;
  readonly sessionTtlMs: number;
  /** False is for tests only. In production a missing verifier must block payouts. */
  readonly requireIntegrity: boolean;
}

export class ConfigError extends Error {}

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const pepper = env.ALARMX_PHONE_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new ConfigError('ALARMX_PHONE_PEPPER must be set to at least 32 characters');
  }
  return {
    phonePepper: pepper,
    allowedOrigins: (env.ALARMX_ALLOWED_ORIGINS ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.ALARMX_TRUST_PROXY === 'true',
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    requireIntegrity: env.ALARMX_REQUIRE_INTEGRITY !== 'false',
  };
}
