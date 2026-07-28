import { NextResponse } from "next/server";
import type { z } from "zod";
import { contactSchema, validationError } from "@/lib/validation";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "contact"), LIMITS.contact);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many messages. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error as z.ZodError), { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ ok: true, message: "Thank you. We reply within one working day." });
  }

  /*
   * Send this on to your inbox or helpdesk here.
   *
   * When you do: never interpolate `message` or `name` into an HTML email
   * without escaping them first. A contact form is the classic path for stored
   * XSS into whatever tool your team reads support mail in.
   */
  console.info(`[contact] ${parsed.data.email}: ${parsed.data.subject}`);

  return NextResponse.json({
    ok: true,
    message: "Thank you. We reply within one working day, Monday to Saturday.",
  });
}
