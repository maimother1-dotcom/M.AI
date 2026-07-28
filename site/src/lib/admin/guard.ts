import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, getAdminConfig, readSession } from "@/lib/admin/auth";

/**
 * The single gate every admin route passes through.
 *
 * One function, called first thing in every handler, so there is exactly one
 * place to audit. Hiding the admin link in the UI is not a control — every one
 * of these endpoints is reachable directly with curl, and each one checks.
 */
export async function requireAdmin(): Promise<
  { ok: true; subject: string } | { ok: false; response: NextResponse }
> {
  // Not configured at all: behave as if the feature does not exist. A 401 tells
  // an attacker there is something here worth attacking.
  if (!getAdminConfig()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }),
    };
  }

  const store = await cookies();
  const session = readSession(store.get(ADMIN_COOKIE)?.value);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "UNAUTHORISED", message: "Sign in to continue." },
        { status: 401 },
      ),
    };
  }

  return { ok: true, subject: session.sub };
}
