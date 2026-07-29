import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { describeOrderStore, listOrders } from "@/lib/order-store";

/**
 * The orders list, for the admin only.
 *
 * Every field here is personal data — names, emails, phone numbers, home
 * addresses. So this route does the same thing every other admin route does and
 * calls `requireAdmin()` first, before touching the store. Hiding the link in
 * the UI is not a control; this endpoint is reachable with curl.
 */

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({
      orders: await listOrders(),
      store: await describeOrderStore(),
    });
  } catch (error) {
    console.error("[admin] could not read orders:", error);
    return NextResponse.json(
      {
        error: "STORE_UNREADABLE",
        message:
          "The order store could not be decrypted. This usually means ORDER_SIGNING_SECRET changed. The file is intact — restore the original secret.",
      },
      { status: 500 },
    );
  }
}
