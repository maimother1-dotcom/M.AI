import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getOverrides } from "@/lib/admin/store";

/**
 * Download the current overrides as JSON.
 *
 * This is the escape hatch that makes the whole overlay design safe. Whatever
 * the store is doing — durable file, ephemeral memory on serverless — an admin
 * can always pull their edits out as a file, commit it to the repository, and
 * have them become part of the versioned catalog.
 *
 * That matters most in exactly the case where the store is weakest: on a
 * platform with an ephemeral filesystem, "edit then export then commit" is a
 * complete, honest workflow that loses nothing.
 */

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const overrides = getOverrides();
  const body = JSON.stringify(overrides, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="catalog-overrides.json"`,
      // Never let a proxy or the browser cache catalog state behind auth.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
