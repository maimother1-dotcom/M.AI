import { NextResponse } from "next/server";
import type { z } from "zod";
import { newsletterSchema, validationError } from "@/lib/validation";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "newsletter"), LIMITS.newsletter);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = newsletterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error as z.ZodError), { status: 400 });
  }

  // Honeypot filled — respond as though it succeeded so the bot does not adapt.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true, message: "Check your inbox for your code." });
  }

  /*
   * Wire your provider in here (Brevo, Klaviyo, Mailchimp). Two things to keep
   * when you do:
   *   - The API key belongs in an env var, never in this file.
   *   - Use double opt-in. A single-opt-in list is a deliverability problem and,
   *     under the DPDP Act and GDPR alike, a consent problem.
   */
  console.info(`[newsletter] subscribe requested: ${parsed.data.email}`);

  return NextResponse.json({
    ok: true,
    message: "Check your inbox — your ten percent code is on its way.",
  });
}
