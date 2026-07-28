import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  createSession,
  getAdminConfig,
  verifyPassword,
  verifyTotp,
} from "@/lib/admin/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Admin sign-in. Email + password + TOTP, all three or nothing.
 *
 * Deliberate choices:
 *   - Aggressive rate limiting. A 6-digit TOTP is only 1,000,000 possibilities;
 *     without a hard limit on attempts it is brute-forceable in an afternoon.
 *   - One generic error for every failure. Distinguishing "wrong password" from
 *     "wrong code" tells an attacker which half they have already solved.
 *   - The password is verified even when the email is wrong, against a dummy
 *     hash, so response timing does not reveal whether the account exists.
 */

export const runtime = "nodejs";

const schema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(200),
    code: z.string().trim().min(6).max(6),
  })
  .strict();

/** Five attempts every fifteen minutes. Generous for a person, useless for a script. */
const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

/** Burned to equalise timing when the email does not match. */
const DUMMY_HASH =
  "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export async function POST(request: Request) {
  const config = getAdminConfig();
  if (!config) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const limit = rateLimit(clientKey(request, "admin-login"), LOGIN_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", message: "Sign-in failed." },
      { status: 401 },
    );
  }

  const { email, password, code } = parsed.data;

  const emailMatches = email.toLowerCase() === config.email.toLowerCase();
  // Always run the KDF, so a wrong email is not measurably faster.
  const passwordMatches = verifyPassword(
    password,
    emailMatches ? config.passwordHash : DUMMY_HASH,
  );
  const codeMatches = verifyTotp(code, config.totpSecret);

  if (!emailMatches || !passwordMatches || !codeMatches) {
    console.warn(`[admin] failed sign-in attempt for ${email}`);
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", message: "Sign-in failed." },
      { status: 401 },
    );
  }

  const session = createSession(config.email);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(ADMIN_COOKIE, session.value, {
    httpOnly: true, // JavaScript cannot read it, so an XSS cannot steal it
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // no cross-site request carries this cookie: CSRF defence
    path: "/",
    maxAge: session.maxAge,
  });

  console.info(`[admin] signed in: ${config.email}`);
  return response;
}
