import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/admin/guard";
import { countExpiredOrders, purgeExpiredOrders, retentionDays } from "@/lib/order-store";

/**
 * Run the retention purge.
 *
 * Two ways in, because this needs to work both for a person and for a timer:
 *
 *   - An authenticated admin session, for pressing the button.
 *   - A bearer token in `authorization`, matching RETENTION_CRON_SECRET, for a
 *     Vercel Cron or a systemd timer. Compared in constant time.
 *
 * GET reports what would be deleted and deletes nothing. Anything that destroys
 * business records should be easy to look at before you run it.
 */

export const runtime = "nodejs";

function cronAuthorised(request: Request): boolean {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    retentionDays: retentionDays(),
    expired: await countExpiredOrders(),
  });
}

export async function POST(request: Request) {
  if (!cronAuthorised(request)) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  const result = await purgeExpiredOrders();
  console.info(
    `[retention] purged ${result.deleted} orders created before ${result.cutoff} ` +
      `(policy: ${retentionDays()} days)`,
  );

  return NextResponse.json({ ok: true, ...result, retentionDays: retentionDays() });
}
