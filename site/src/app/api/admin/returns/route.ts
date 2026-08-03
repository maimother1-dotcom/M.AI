import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/guard";
import { refundReturn, receiveReturn } from "@/lib/refunds";
import {
  RETURN_REASONS,
  createReturn,
  getReturn,
  isReturnsEnabled,
  listReturns,
  transitionReturn,
} from "@/lib/returns";

/**
 * Returns, from the seller's side.
 *
 * The site's returns page promises customers there is no portal and no form —
 * they email an order number and get a label. This is what the person reading
 * that email uses.
 *
 * **The refund amount is never in a request.** POST records what is coming back;
 * the value is derived from the order. PATCH moves a return along; the money
 * follows from the record. There is no field anywhere on this route that can
 * change how much leaves the account, which is the property that matters on an
 * endpoint that issues refunds.
 */

export const runtime = "nodejs";

const createSchema = z
  .object({
    orderNumber: z.string().trim().min(4).max(40),
    reason: z.enum(RETURN_REASONS),
    lines: z
      .array(
        z.object({
          sku: z.string().regex(/^[a-z]{2}-\d{3}$/),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(40),
  })
  .strict();

const patchSchema = z
  .object({
    rma: z.string().trim().min(4).max(40),
    action: z.enum(["receive", "refund", "reject", "cancel"]),
  })
  .strict();

function notConfigured() {
  return NextResponse.json(
    {
      error: "NOT_CONFIGURED",
      message:
        "Returns need a database. Set DATABASE_URL — a refund that is not recorded is worse than one not issued.",
    },
    { status: 503 },
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!isReturnsEnabled()) return notConfigured();

  return NextResponse.json({ returns: await listReturns() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!isReturnsEnabled()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const record = await createReturn(parsed.data);
  if (!record) {
    return NextResponse.json(
      {
        error: "NOT_ELIGIBLE",
        message: "No such order, or nothing on it that could be refunded.",
      },
      { status: 409 },
    );
  }

  console.info(
    `[returns] ${auth.subject} raised ${record.rma} against ${record.orderNumber} for ${record.refundableMinor}`,
  );
  revalidatePath("/admin/orders");
  return NextResponse.json({ ok: true, return: record });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!isReturnsEnabled()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const { rma, action } = parsed.data;

  if (action === "receive") {
    const received = await receiveReturn(rma);
    if (!received) {
      return NextResponse.json(
        { error: "NOT_PENDING", message: "That return is not awaiting a parcel." },
        { status: 409 },
      );
    }
    console.info(`[returns] ${auth.subject} received ${rma}`);
    revalidatePath("/admin/orders");
    return NextResponse.json({ ok: true, return: received });
  }

  if (action === "refund") {
    const result = await refundReturn(rma);
    if (!result.ok) {
      console.warn(`[returns] ${auth.subject} could not refund ${rma}: ${result.reason}`);
      return NextResponse.json(
        { error: result.reason ?? "FAILED", message: result.message ?? "The refund did not go through." },
        { status: 409 },
      );
    }
    console.info(`[returns] ${auth.subject} refunded ${rma}`);
    revalidatePath("/admin/orders");
    return NextResponse.json({
      ok: true,
      amountMinor: result.amountMinor,
      refundId: result.refundId,
      return: await getReturn(rma),
    });
  }

  // Reject and cancel are bookkeeping: no money and no stock move.
  const moved = await transitionReturn(rma, "requested", action === "reject" ? "rejected" : "cancelled");
  if (!moved) {
    return NextResponse.json(
      { error: "NOT_PENDING", message: "Only a return still awaiting its parcel can be closed this way." },
      { status: 409 },
    );
  }
  console.info(`[returns] ${auth.subject} ${action}ed ${rma}`);
  revalidatePath("/admin/orders");
  return NextResponse.json({ ok: true, return: moved });
}
