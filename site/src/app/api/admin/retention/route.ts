import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/admin/guard";
import { countExpiredOrders, purgeExpiredOrders, retentionDays } from "@/lib/order-store";
import { sweepExpiredReservations } from "@/lib/fulfilment";
import { reservationMinutes, reservedTotal } from "@/lib/stock";

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
    reservationMinutes: reservationMinutes(),
    reservedUnits: await reservedTotal(),
  });
}

export async function POST(request: Request) {
  if (!cronAuthorised(request)) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  // One timer, two jobs. Releasing abandoned holds needs to happen far more
  // often than a data purge, and asking somebody to configure two crons to keep
  // their shop from looking sold out is how one of them never gets configured.
  const releasedHolds = await sweepExpiredReservations();

  const result = await purgeExpiredOrders();
  console.info(
    `[retention] purged ${result.deleted} orders created before ${result.cutoff} ` +
      `(policy: ${retentionDays()} days)`,
  );

  return NextResponse.json({ ok: true, ...result, releasedHolds, retentionDays: retentionDays() });
}
