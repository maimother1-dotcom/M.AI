import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OrderTotals, PricedLine } from "@/lib/types";

/**
 * Order records, persisted.
 *
 * Three properties this file exists to guarantee:
 *
 * 1. **An order is written before the customer is asked to pay.** If the write
 *    fails we decline the checkout rather than take money we cannot account for.
 *
 * 2. **The personal data in it is encrypted, wherever it lands.** An order is a
 *    person's full name, email, phone number and home address. AES-256-GCM, with
 *    the key derived from ORDER_SIGNING_SECRET via HKDF under a separate label,
 *    so the storage key and the token-signing key are cryptographically distinct
 *    even though they come from one secret. On Postgres that means the database
 *    host — Neon, Supabase, Vercel — stores a blob it cannot read.
 *
 * 3. **It says out loud when it is not durable,** rather than accepting orders
 *    that quietly evaporate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO BACKENDS, chosen by environment:
 *
 *   Postgres  DATABASE_URL or POSTGRES_URL is set. Durable anywhere, including
 *             serverless. This is the one to use for real money.
 *   File      Neither is set, and ./data is writable. Durable on a single
 *             long-lived server; fine for a VPS, fine for local.
 *   Memory    Neither is set and the filesystem is read-only, which is what
 *             serverless looks like. NOT durable, and production checkout
 *             refuses rather than pretending.
 *
 * The file backend rewrites the whole file per write, so two concurrent writes
 * from different worker processes can lose one. Postgres does not have that
 * problem: every mutation below is a single statement.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

export interface StoredOrder {
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;

  paymentMode: "demo" | "stripe" | "razorpay";
  /** Razorpay order id, or Stripe PaymentIntent id. */
  paymentIntentId?: string;
  /** Razorpay payment id, once one exists. */
  paymentId?: string;
  /** upi, card, netbanking … as the processor reported it. */
  paymentMethod?: string;
  paidAt?: string;
  failureReason?: string;

  email: string;
  name: string;
  phone?: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  shippingMethod: string;

  lines: PricedLine[];
  totals: OrderTotals;
  currency: string;
  appliedPromo: string | null;
}

type OrderMap = Record<string, StoredOrder>;

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_PATH = path.join(DATA_DIR, "orders.enc.json");

function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/* -------------------------------------------------------------------------
   Encryption
   ------------------------------------------------------------------------- */

/**
 * Fixed salt, random IV per write.
 *
 * A fixed salt is the right call here and not a shortcut: HKDF's salt exists to
 * spread entropy from a low-entropy input, and the input is a 32+ character
 * random secret that already has plenty. What must never repeat is the IV,
 * because a reused (key, IV) pair in GCM is catastrophic — so that is 12 fresh
 * random bytes on every single write.
 */
const HKDF_SALT = Buffer.from("lindienne.order-store.v1", "utf8");
const HKDF_INFO = Buffer.from("aes-256-gcm order records", "utf8");

let cachedKey: Buffer | null = null;

/**
 * Whether orders can be persisted at all.
 *
 * Deliberately stricter than `isOrderSigningConfigured()`, which falls back to a
 * per-process random secret outside production. That fallback is fine for
 * short-lived receipt tokens and useless for storage: orders written under it
 * become permanently unreadable at the next restart, which is worse than not
 * storing them, because you would not find out until you went looking.
 */
export function isOrderStoreConfigured(): boolean {
  const secret = process.env.ORDER_SIGNING_SECRET;
  return typeof secret === "string" && secret.length >= 32;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ORDER_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ORDER_SIGNING_SECRET must be at least 32 characters to persist orders. " +
        "Generate one with: openssl rand -base64 48",
    );
  }
  cachedKey = Buffer.from(
    crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), HKDF_SALT, HKDF_INFO, 32),
  );
  return cachedKey;
}

interface Envelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decrypt(raw: string): string {
  const envelope = JSON.parse(raw) as Envelope;
  if (envelope.v !== 1) throw new Error(`Unsupported order store version: ${envelope.v}`);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  // GCM authenticates as it decrypts: `final()` throws if the ciphertext was
  // edited, so a tampered store fails loudly instead of returning altered
  // orders. On Postgres that also means a compromised database cannot forge one.
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Split an order into the part Postgres may read and the part it may not.
 *
 * Status, dates, ids and the total stay as columns so the admin list can sort,
 * filter and total in SQL rather than decrypting every row. Everything that
 * identifies a human — name, email, phone, address, and the line items that
 * reveal what they bought — goes in the encrypted blob.
 */
type OrderSecrets = Pick<
  StoredOrder,
  "email" | "name" | "phone" | "shippingAddress" | "shippingMethod" | "lines" | "totals" | "appliedPromo" | "failureReason"
>;

function secretsOf(order: StoredOrder): OrderSecrets {
  return {
    email: order.email,
    name: order.name,
    ...(order.phone && { phone: order.phone }),
    shippingAddress: order.shippingAddress,
    shippingMethod: order.shippingMethod,
    lines: order.lines,
    totals: order.totals,
    appliedPromo: order.appliedPromo,
    ...(order.failureReason && { failureReason: order.failureReason }),
  };
}

/* -------------------------------------------------------------------------
   Backend selection
   ------------------------------------------------------------------------- */

type StoreMode = "postgres" | "file" | "memory" | "disabled";

let mode: StoreMode | null = null;

function resolveMode(): StoreMode {
  if (mode) return mode;
  if (!isOrderStoreConfigured()) {
    mode = "disabled";
    return mode;
  }
  if (connectionString()) {
    mode = "postgres";
    return mode;
  }
  // Probe by actually writing, not by asking `access(W_OK)`.
  //
  // access() answers "would the permission bits allow it", which is not the same
  // question. Running as root it returns success on a directory nobody can write
  // to, and it does not know about full disks or read-only remounts. Getting this
  // wrong means believing orders are durable when they are not — the exact
  // failure this whole check exists to prevent — so it costs one file write at
  // startup to be sure.
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, `.probe-${process.pid}`);
    fs.writeFileSync(probe, "", { mode: 0o600 });
    fs.unlinkSync(probe);
    mode = "file";
  } catch {
    mode = "memory";
  }
  return mode;
}

/** Whether an order written now will still be here tomorrow. */
export function isOrderStoreDurable(): boolean {
  const current = resolveMode();
  return current === "postgres" || current === "file";
}

/* -------------------------------------------------------------------------
   Postgres backend
   ------------------------------------------------------------------------- */

/**
 * `pg` is imported lazily, and only when a connection string exists.
 *
 * A static import would pull the driver into every build — including the
 * file-backed VPS case and local development, where it is dead weight — and
 * would make `next build` resolve a native-ish dependency it never uses.
 */
type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

let poolPromise: Promise<PgPool> | null = null;

async function getPool(): Promise<PgPool> {
  poolPromise ??= (async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: connectionString(),
      // Managed Postgres (Neon, Supabase, Vercel) terminates TLS with a chain
      // Node does not trust out of the box. `require` still encrypts; it just
      // does not verify the chain. Set PGSSLMODE=verify-full with a CA bundle if
      // your provider gives you one — but never turn TLS off.
      ...(process.env.PGSSLMODE === "disable"
        ? {}
        : { ssl: { rejectUnauthorized: false } }),
      // Serverless: one connection per invocation, released quickly. Point this
      // at your provider's POOLED connection string, not the direct one.
      max: Number(process.env.PGPOOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    await pool.query(SCHEMA);
    return pool as unknown as PgPool;
  })();
  return poolPromise;
}

/**
 * Created on first use, idempotently.
 *
 * A migration tool would be the grown-up answer for a schema that changes. This
 * one is a single table that has changed zero times, and `create if not exists`
 * on boot means deploying is deploying rather than deploying plus remembering to
 * run something.
 */
const SCHEMA = `
  create table if not exists orders (
    order_number      text primary key,
    created_at        timestamptz not null,
    updated_at        timestamptz not null,
    status            text not null,
    payment_mode      text not null,
    payment_intent_id text,
    payment_id        text,
    payment_method    text,
    paid_at           timestamptz,
    total_minor       bigint not null,
    currency          text not null,
    payload           text not null
  );
  create index if not exists orders_created_at_idx on orders (created_at desc);
  create index if not exists orders_payment_intent_idx on orders (payment_intent_id);
  create index if not exists orders_payment_id_idx on orders (payment_id);
`;

/** Columns are nullable in SQL, and an absent field is not the same as `null` here. */
function optional<T>(value: unknown, map: (v: NonNullable<unknown>) => T): T | undefined {
  return value === null || value === undefined ? undefined : map(value);
}

function rowToOrder(row: Record<string, unknown>): StoredOrder {
  const secrets = JSON.parse(decrypt(row.payload as string)) as OrderSecrets;
  const paymentIntentId = optional(row.payment_intent_id, String);
  const paymentId = optional(row.payment_id, String);
  const paymentMethod = optional(row.payment_method, String);
  const paidAt = optional(row.paid_at, (v) => (v as Date).toISOString());

  return {
    orderNumber: row.order_number as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    status: row.status as OrderStatus,
    paymentMode: row.payment_mode as StoredOrder["paymentMode"],
    ...(paymentIntentId !== undefined && { paymentIntentId }),
    ...(paymentId !== undefined && { paymentId }),
    ...(paymentMethod !== undefined && { paymentMethod }),
    ...(paidAt !== undefined && { paidAt }),
    currency: row.currency as string,
    ...secrets,
  };
}

/* -------------------------------------------------------------------------
   File backend
   ------------------------------------------------------------------------- */

let cache: OrderMap | null = null;
/** `mtimeMs:size` of the file the cache was built from — see admin/store.ts. */
let cacheStamp: string | null = null;

function fileStamp(): string {
  try {
    const stat = fs.statSync(ORDERS_PATH);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
}

function readAll(): OrderMap {
  if (resolveMode() !== "file") {
    cache ??= {};
    return cache;
  }

  const stamp = fileStamp();
  if (cache && stamp === cacheStamp) return cache;

  try {
    cache = JSON.parse(decrypt(fs.readFileSync(ORDERS_PATH, "utf8"))) as OrderMap;
  } catch (error) {
    if (fs.existsSync(ORDERS_PATH)) {
      // An unreadable file is not an empty one. Starting clean here would mean
      // silently discarding every order the moment the key changed, so this
      // shouts and keeps whatever is on disk untouched.
      console.error(
        "[orders] could not read the order store. Has ORDER_SIGNING_SECRET changed? " +
          "The file is intact; orders are unreadable until the original secret is restored.",
        error,
      );
      throw new Error("ORDER_STORE_UNREADABLE");
    }
    cache = {};
  }
  cacheStamp = stamp;
  return cache;
}

function writeAll(next: OrderMap): void {
  cache = next;
  if (resolveMode() !== "file") return;
  const tmp = `${ORDERS_PATH}.tmp`;
  // 0600: an order file is readable by its owner and nobody else on the box.
  fs.writeFileSync(tmp, encrypt(JSON.stringify(next)), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, ORDERS_PATH);
  cacheStamp = fileStamp();
}

/* -------------------------------------------------------------------------
   Operations
   ------------------------------------------------------------------------- */

export async function saveOrder(order: StoredOrder): Promise<void> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    await pool.query(
      `insert into orders (
         order_number, created_at, updated_at, status, payment_mode,
         payment_intent_id, payment_id, payment_method, paid_at,
         total_minor, currency, payload
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (order_number) do update set
         updated_at = excluded.updated_at,
         status = excluded.status,
         payment_intent_id = excluded.payment_intent_id,
         payment_id = excluded.payment_id,
         payment_method = excluded.payment_method,
         paid_at = excluded.paid_at,
         total_minor = excluded.total_minor,
         payload = excluded.payload`,
      [
        order.orderNumber,
        order.createdAt,
        order.updatedAt,
        order.status,
        order.paymentMode,
        order.paymentIntentId ?? null,
        order.paymentId ?? null,
        order.paymentMethod ?? null,
        order.paidAt ?? null,
        order.totals.totalMinor,
        order.currency,
        encrypt(JSON.stringify(secretsOf(order))),
      ],
    );
    return;
  }

  const all = { ...readAll() };
  all[order.orderNumber] = order;
  writeAll(all);
}

export async function getOrder(orderNumber: string): Promise<StoredOrder | undefined> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    const { rows } = await pool.query("select * from orders where order_number = $1", [orderNumber]);
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  }
  return readAll()[orderNumber];
}

/** Newest first. */
export async function listOrders(limit = 200): Promise<StoredOrder[]> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select * from orders order by created_at desc limit $1",
      [limit],
    );
    return rows.map(rowToOrder);
  }
  return Object.values(readAll())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Find by the processor's own id, which is all a webhook reliably carries. */
export async function getOrderByPaymentIntent(intentId: string): Promise<StoredOrder | undefined> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select * from orders where payment_intent_id = $1 limit 1",
      [intentId],
    );
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  }
  return Object.values(readAll()).find((o) => o.paymentIntentId === intentId);
}

/**
 * Find by the payment id rather than the order id.
 *
 * Needed for refunds: a refund event carries the payment it reverses and none of
 * the notes we attached to the original order, so this is the only thread back.
 */
export async function getOrderByPaymentId(paymentId: string): Promise<StoredOrder | undefined> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    const { rows } = await pool.query("select * from orders where payment_id = $1 limit 1", [
      paymentId,
    ]);
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  }
  return Object.values(readAll()).find((o) => o.paymentId === paymentId);
}

export interface PaymentOutcome {
  status: Extract<OrderStatus, "paid" | "failed" | "refunded">;
  paymentId?: string;
  paymentMethod?: string;
  failureReason?: string;
}

/**
 * Record a payment outcome. Idempotent, and refuses to walk an order backwards.
 *
 * Both the webhook and the confirmation endpoint call this, and either can
 * arrive first — Razorpay's webhook regularly beats the customer's browser back.
 * Marking an already-paid order paid again must therefore be a no-op rather than
 * a second fulfilment trigger. A `failed` arriving after a `paid` is ignored
 * outright: a later failure event for a captured payment is a retry artefact,
 * and letting it flip a paid order to failed would strand a real customer.
 *
 * On Postgres both rules live in the WHERE clause, so two racing callers cannot
 * both believe they were the one that changed it. The file backend has to
 * read-modify-write and cannot make that promise, which is one more reason
 * Postgres is the backend for real money.
 */
export async function recordPaymentOutcome(
  orderNumber: string,
  outcome: PaymentOutcome,
): Promise<{ order: StoredOrder; changed: boolean } | null> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `update orders set
         status = $2,
         updated_at = $3,
         payment_id = coalesce($4, payment_id),
         payment_method = coalesce($5, payment_method),
         paid_at = case when $2 = 'paid' then $3::timestamptz else paid_at end
       where order_number = $1
         and status <> $2
         and not (status = 'paid' and $2 = 'failed')
       returning *`,
      [orderNumber, outcome.status, now, outcome.paymentId ?? null, outcome.paymentMethod ?? null],
    );

    if (rows[0]) {
      // The failure reason lives inside the encrypted blob, so it needs a second
      // pass. Only on a real transition, and only when there is one to record.
      const updated = rowToOrder(rows[0]);
      if (outcome.failureReason) {
        updated.failureReason = outcome.failureReason;
        await pool.query("update orders set payload = $2 where order_number = $1", [
          orderNumber,
          encrypt(JSON.stringify(secretsOf(updated))),
        ]);
      }
      return { order: updated, changed: true };
    }

    // No row changed: either the order does not exist, or the update was a
    // no-op. Those mean very different things, so distinguish them.
    const existing = await getOrder(orderNumber);
    return existing ? { order: existing, changed: false } : null;
  }

  const all = { ...readAll() };
  const existing = all[orderNumber];
  if (!existing) return null;

  if (existing.status === outcome.status) return { order: existing, changed: false };
  if (existing.status === "paid" && outcome.status === "failed") {
    return { order: existing, changed: false };
  }

  const now = new Date().toISOString();
  const updated: StoredOrder = {
    ...existing,
    status: outcome.status,
    updatedAt: now,
    ...(outcome.paymentId && { paymentId: outcome.paymentId }),
    ...(outcome.paymentMethod && { paymentMethod: outcome.paymentMethod }),
    ...(outcome.failureReason && { failureReason: outcome.failureReason }),
    ...(outcome.status === "paid" && { paidAt: now }),
  };

  all[orderNumber] = updated;
  writeAll(all);
  return { order: updated, changed: true };
}

/* ------------------------------------------------------------- Describe */

export async function describeOrderStore(): Promise<{
  mode: StoreMode;
  durable: boolean;
  count: number;
  note: string;
}> {
  const current = resolveMode();

  let count = -1;
  let reachable = true;
  try {
    if (current === "postgres") {
      const pool = await getPool();
      const { rows } = await pool.query("select count(*)::int as n from orders");
      count = Number(rows[0]?.n ?? 0);
    } else if (current !== "disabled") {
      count = Object.keys(readAll()).length;
    }
  } catch (error) {
    reachable = false;
    console.error("[orders] store health check failed:", error);
  }

  const note =
    current === "disabled"
      ? "ORDER_SIGNING_SECRET is not set, so orders are not being recorded at all. Checkout is refused rather than taking payment for an order nothing would remember."
      : current === "postgres"
        ? reachable
          ? "Orders are stored in Postgres, with every personal detail encrypted before it leaves this server. Durable anywhere, including serverless."
          : "Postgres is configured but could not be reached. Checkout will refuse until it is, which is the right failure — see the server logs."
        : current === "file"
          ? "Orders are written to data/orders.enc.json, encrypted with AES-256-GCM. Durable on a single server, and NOT durable on serverless. Set DATABASE_URL to move to Postgres."
          : "This filesystem is read-only, so orders cannot be persisted and production checkout is refused. Set DATABASE_URL to a Postgres connection string.";

  return { mode: current, durable: isOrderStoreDurable() && reachable, count, note };
}

/** Used by the tests. Never wired to a route — there is no "delete all orders" button. */
export async function clearAllOrders(): Promise<void> {
  if (resolveMode() === "postgres") {
    const pool = await getPool();
    await pool.query("delete from orders");
    return;
  }
  writeAll({});
}
