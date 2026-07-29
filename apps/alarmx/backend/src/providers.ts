/**
 * The three things the server cannot decide by itself, behind interfaces.
 *
 * Each has a real implementation that needs a network this environment cannot
 * reach (Google Play Integrity, Firebase Auth, AdMob reporting), so each is an
 * interface with a test double here and a documented production wiring. That
 * keeps the *decisions* — which are the parts that lose money when wrong —
 * testable in full.
 */

/* ------------------------------------------------------------ play integrity */

export interface IntegrityVerdict {
  readonly passed: boolean;
  /** Google's device-bound hash, used for the referral and signup limits. */
  readonly deviceHash: string | null;
  readonly reason?: string;
}

export interface IntegrityVerifier {
  verify(token: string | null, expectedNonce: string): Promise<IntegrityVerdict>;
}

/**
 * The default when nothing is configured. **Fails closed.**
 *
 * An unconfigured integrity check that returns `passed: true` is worse than no
 * check at all, because everything downstream is written believing it ran. If
 * this is what is deployed, payouts stop — which is the correct direction for
 * a mistake about money to fail in.
 */
export class DenyingIntegrityVerifier implements IntegrityVerifier {
  async verify(): Promise<IntegrityVerdict> {
    return { passed: false, deviceHash: null, reason: 'integrity_not_configured' };
  }
}

/* ---------------------------------------------------------------------- otp */

export interface OtpProvider {
  /** Costs real money per message, which is why PRD 18.6 rate limits it hard. */
  send(phone: string): Promise<void>;
  check(phone: string, code: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ revenue */

/**
 * What one verified view is actually worth.
 *
 * **This number never comes from the client, and it is never a forecast.** The
 * AdMob SSV callback confirms that a view happened; it does not carry revenue.
 * So the production implementation reads *realised* revenue from AdMob
 * reporting — yesterday's actual RPM for the ad unit — and the share is paid
 * against that. Money that has already arrived, which is the entire mechanism
 * in PRD 2.
 *
 * A consequence worth stating: on day one, before any reporting exists, the
 * correct value is the floor, not an estimate. Underpaying briefly is
 * recoverable. Overpaying against revenue that never arrives is the failure
 * this whole design exists to make impossible.
 */
export interface RevenueSource {
  grossMicropaiseForView(adNetwork: string | null): Promise<bigint>;
}

export class StaticRevenueSource implements RevenueSource {
  constructor(private readonly micropaise: bigint) {
    if (micropaise < 0n) throw new RangeError('gross cannot be negative');
  }
  async grossMicropaiseForView(): Promise<bigint> {
    return this.micropaise;
  }
}
