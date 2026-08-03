import "server-only";
import crypto from "node:crypto";
import { apportionDiscount } from "@/lib/gst";
import { getOrder, getPool, type StoredOrder } from "@/lib/order-store";

/**
 * Returns and refunds.
 *
 * The site's own returns page promises "no form to fill in and no portal to log
 * into" — a customer emails their order number and gets a prepaid label. So this
 * is deliberately the SELLER's side of that promise: a way to record what is
 * coming back, put it on the shelf when it arrives, and refund the right amount
 * to the right payment. It is not a customer-facing returns portal, because the
 * copy says there isn't one.
 *
 * Three rules this file exists to hold:
 *
 * 1. **The refund amount is computed here, never supplied.** It is derived from
 *    what the customer was actually charged for the specific pieces coming back,
 *    including their share of any promo discount. A request that carried an
 *    amount would be a way to drain the account.
 *
 * 2. **A refund is claimed before it is issued.** Razorpay retries, admins
 *    double-click, and a duplicated refund is money gone against an order that
 *    cannot account for it.
 *
 * 3. **Stock goes back when the parcel does, not when the refund does.** Those
 *    are different days, and putting a piece back on sale before it is in your
 *    hands is how you sell something you do not have.
 */

export type ReturnStatus = "requested" | "received" | "refunded" | "rejected" | "cancelled";

/**
 * Why it is coming back.
 *
 * A closed list rather than free text, deliberately. Free text on a customer
 * record is a place personal data accumulates unnoticed and an injection surface
 * for anything that later renders it — and for reporting, "how many for size?"
 * is a question a fixed list can answer and prose cannot.
 */
export const RETURN_REASONS = [
  "size",
  "not-as-described",
  "faulty",
  "damaged-in-transit",
  "changed-mind",
  "wrong-item-sent",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export interface ReturnLine {
  sku: string;
  quantity: number;
}

export interface ReturnRecord {
  rma: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: ReturnStatus;
  reason: ReturnReason;
  lines: ReturnLine[];
  /** Computed at creation from what was charged. Never supplied by a caller. */
  refundableMinor: number;
  refundedMinor: number;
  refundId?: string;
  refundedAt?: string;
  receivedAt?: string;
  /** Whether the pieces have been put back on the shelf. Once only. */
  restocked: boolean;
}

const SCHEMA = `
  create table if not exists returns (
    rma              text primary key,
    order_number     text not null,
    created_at       timestamptz not null,
    updated_at       timestamptz not null,
    status           text not null,
    reason           text not null,
    lines            jsonb not null,
    refundable_minor bigint not null,
    refunded_minor   bigint not null default 0,
    refund_id        text,
    refunded_at      timestamptz,
    received_at      timestamptz,
    restocked        boolean not null default false
  );
  create index if not exists returns_order_idx on returns (order_number);
  create index if not exists returns_status_idx on returns (status, created_at desc);
`;

let ready: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  ready ??= (async () => {
    const pool = await getPool();
    await pool.query(SCHEMA);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export function isReturnsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

/**
 * A return number.
 *
 * Random rather than sequential, for the same reason order numbers are: a
 * sequential one tells anyone who sees two of them how many returns you took in
 * between, which is a number you would rather not publish on a label.
 */
export function generateRma(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `RMA-${out.slice(0, 3)}-${out.slice(3)}`;
}

/* -------------------------------------------------------------------------
   What a return is worth
   ------------------------------------------------------------------------- */

/**
 * The refundable value of some lines from an order.
 *
 * Derived from what was charged, not from the catalogue — a price edited since
 * the sale must not change what a customer gets back. The order-level discount
 * is apportioned exactly as `priceCart()` apportioned it, so returning one of
 * two discounted pieces returns half the discounted value rather than the full
 * list price.
 *
 * Shipping comes back only when the whole order does. Sending one piece of three
 * back does not undo the cost of delivering the parcel, and the returns page
 * promises no restocking fee rather than free shipping on partial returns.
 */
export function refundableFor(order: StoredOrder, lines: ReturnLine[]): number {
  const discounts = apportionDiscount(
    order.lines.map((line) => line.lineTotalMinor),
    order.totals.discountMinor,
  );

  let refundable = 0;
  let returningEverything = true;

  order.lines.forEach((line, index) => {
    const asked = lines.find((l) => l.sku === line.sku)?.quantity ?? 0;
    const quantity = Math.max(0, Math.min(asked, line.quantity));
    if (quantity < line.quantity) returningEverything = false;
    if (quantity === 0) return;

    // Per unit, from the line's own discounted gross, so the parts of a
    // partially returned line sum to the whole.
    const grossLine = line.lineTotalMinor - (discounts[index] ?? 0);
    refundable += Math.round((grossLine * quantity) / line.quantity);
  });

  if (returningEverything) refundable += order.totals.shippingMinor;

  // Never more than was taken, whatever rounding did.
  return Math.min(refundable, order.totals.totalMinor);
}

/**
 * Whether these lines can still be returned, and what a human should know.
 *
 * Advisory, not a gate. The returns page says faulty goods are outside every
 * exception, and a person deciding a specific case knows things this function
 * does not — so it surfaces the rules and lets the admin overrule them, rather
 * than refusing and forcing the refund into the Razorpay dashboard where nothing
 * is recorded.
 */
export function returnAdvice(order: StoredOrder, lines: ReturnLine[]): string[] {
  const notes: string[] = [];

  const since = order.fulfilmentStatus === "delivered" ? order.updatedAt : order.paidAt;
  if (since) {
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
    if (days > 30) {
      notes.push(
        `This order is ${days} days old. The thirty-day window has passed — fine to honour, but it is outside the published policy.`,
      );
    }
  }

  const beauty = lines.some((line) => line.sku.startsWith("bt-"));
  if (beauty) {
    notes.push("Beauty is returnable unopened only. Check the seal before restocking it.");
  }

  const jewellery = lines.some((line) => line.sku.startsWith("jw-"));
  if (jewellery) {
    notes.push("Pierced jewellery cannot be resold once worn. Do not restock unless it is sealed.");
  }

  if (order.status !== "paid") {
    notes.push(`This order is ${order.status}, not paid. There may be nothing to refund.`);
  }

  return notes;
}

/* -------------------------------------------------------------------------
   Storage
   ------------------------------------------------------------------------- */

function rowToReturn(row: Record<string, unknown>): ReturnRecord {
  return {
    rma: String(row.rma),
    orderNumber: String(row.order_number),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    status: row.status as ReturnStatus,
    reason: row.reason as ReturnReason,
    lines: row.lines as ReturnLine[],
    refundableMinor: Number(row.refundable_minor),
    refundedMinor: Number(row.refunded_minor),
    ...(row.refund_id ? { refundId: String(row.refund_id) } : {}),
    ...(row.refunded_at ? { refundedAt: (row.refunded_at as Date).toISOString() } : {}),
    ...(row.received_at ? { receivedAt: (row.received_at as Date).toISOString() } : {}),
    restocked: Boolean(row.restocked),
  };
}

export async function createReturn(input: {
  orderNumber: string;
  reason: ReturnReason;
  lines: ReturnLine[];
}): Promise<ReturnRecord | null> {
  if (!isReturnsEnabled()) return null;

  const order = await getOrder(input.orderNumber);
  if (!order) return null;

  // The amount is derived here, from the order, every time. There is no path by
  // which a caller can influence it.
  const refundableMinor = refundableFor(order, input.lines);
  if (refundableMinor <= 0) return null;

  await ensureReady();
  const pool = await getPool();
  const now = new Date().toISOString();
  const record: ReturnRecord = {
    rma: generateRma(),
    orderNumber: order.orderNumber,
    createdAt: now,
    updatedAt: now,
    status: "requested",
    reason: input.reason,
    lines: input.lines,
    refundableMinor,
    refundedMinor: 0,
    restocked: false,
  };

  await pool.query(
    `insert into returns (
       rma, order_number, created_at, updated_at, status, reason, lines,
       refundable_minor, refunded_minor, restocked
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,0,false)`,
    [
      record.rma,
      record.orderNumber,
      record.createdAt,
      record.updatedAt,
      record.status,
      record.reason,
      JSON.stringify(record.lines),
      record.refundableMinor,
    ],
  );

  return record;
}

export async function getReturn(rma: string): Promise<ReturnRecord | undefined> {
  if (!isReturnsEnabled()) return undefined;
  await ensureReady();
  const pool = await getPool();
  const { rows } = await pool.query("select * from returns where rma = $1", [rma]);
  return rows[0] ? rowToReturn(rows[0]) : undefined;
}

export async function listReturns(limit = 200): Promise<ReturnRecord[]> {
  if (!isReturnsEnabled()) return [];
  await ensureReady();
  const pool = await getPool();
  const { rows } = await pool.query(
    "select * from returns order by created_at desc limit $1",
    [limit],
  );
  return rows.map(rowToReturn);
}

export async function listReturnsForOrder(orderNumber: string): Promise<ReturnRecord[]> {
  if (!isReturnsEnabled()) return [];
  await ensureReady();
  const pool = await getPool();
  const { rows } = await pool.query(
    "select * from returns where order_number = $1 order by created_at desc",
    [orderNumber],
  );
  return rows.map(rowToReturn);
}

/**
 * Move a return's status, once.
 *
 * `from` is required and checked in the WHERE clause, so two admins clicking at
 * the same moment cannot both believe they advanced it — which matters most on
 * the transition into `refunded`.
 */
export async function transitionReturn(
  rma: string,
  from: ReturnStatus,
  to: ReturnStatus,
): Promise<ReturnRecord | null> {
  if (!isReturnsEnabled()) return null;
  await ensureReady();
  const pool = await getPool();
  const now = new Date().toISOString();

  const { rows } = await pool.query(
    `update returns set
       status = $3,
       updated_at = $4,
       received_at = case when $3 = 'received' then $4::timestamptz else received_at end
     where rma = $1 and status = $2
     returning *`,
    [rma, from, to, now],
  );
  return rows[0] ? rowToReturn(rows[0]) : null;
}

/** Claim the right to issue this refund. True to exactly one caller. */
export async function claimRefund(rma: string): Promise<ReturnRecord | null> {
  if (!isReturnsEnabled()) return null;
  await ensureReady();
  const pool = await getPool();

  const { rows } = await pool.query(
    `update returns set status = 'refunded', updated_at = $2, refunded_at = $2
      where rma = $1 and status = 'received' and refunded_minor = 0
     returning *`,
    [rma, new Date().toISOString()],
  );
  return rows[0] ? rowToReturn(rows[0]) : null;
}

/** Record the outcome of a refund that has actually happened. */
export async function recordRefund(
  rma: string,
  refundedMinor: number,
  refundId: string | null,
): Promise<void> {
  if (!isReturnsEnabled()) return;
  const pool = await getPool();
  await pool.query(
    "update returns set refunded_minor = $2, refund_id = $3, updated_at = $4 where rma = $1",
    [rma, refundedMinor, refundId, new Date().toISOString()],
  );
}

/** Undo a claim when the refund did not go through, so it can be retried. */
export async function releaseRefundClaim(rma: string): Promise<void> {
  if (!isReturnsEnabled()) return;
  const pool = await getPool();
  await pool.query(
    `update returns set status = 'received', refunded_at = null, updated_at = $2
      where rma = $1 and status = 'refunded' and refunded_minor = 0`,
    [rma, new Date().toISOString()],
  );
}

/** Mark the pieces as back on the shelf. True only the first time. */
export async function claimRestock(rma: string): Promise<boolean> {
  if (!isReturnsEnabled()) return false;
  await ensureReady();
  const pool = await getPool();
  const { rows } = await pool.query(
    "update returns set restocked = true, updated_at = $2 where rma = $1 and restocked = false returning rma",
    [rma, new Date().toISOString()],
  );
  return rows.length > 0;
}
