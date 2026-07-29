import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OrderTotals, PricedLine } from "@/lib/types";

/**
 * Order records, persisted.
 *
 * Until now there was no order record anywhere: Stripe was the system of record
 * in Stripe mode, and in demo mode a signed token in the customer's URL was the
 * only trace. That is why the admin had no orders list, and why nothing could be
 * handed to a courier.
 *
 * Two properties this file exists to guarantee:
 *
 * 1. **An order is written before the customer is asked to pay.** If the write
 *    fails we decline the checkout rather than take money we cannot account for.
 *
 * 2. **It is encrypted on disk.** An order is a person's full name, email,
 *    phone number and home address. A plaintext JSON file of those on a VPS is a
 *    data breach waiting for one misconfigured directory listing. AES-256-GCM,
 *    with the key derived from ORDER_SIGNING_SECRET via HKDF — a separate label,
 *    so the storage key and the token-signing key are cryptographically distinct
 *    even though they come from one secret.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADAPTER SEAM. This is a single-file store, which is honest about its limits:
 * every write rewrites the whole file, and two concurrent writes from different
 * worker processes can lose one of them. That is survivable at a boutique's
 * order rate and is not survivable at scale. Replace `readAll` and `writeAll`
 * with a table and nothing outside this file changes.
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
  // GCM authenticates as it decrypts: `final()` throws if the file was edited,
  // so a tampered store fails loudly instead of returning altered orders.
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* -------------------------------------------------------------------------
   Persistence
   ------------------------------------------------------------------------- */

type StoreMode = "file" | "memory" | "disabled";

let mode: StoreMode | null = null;
let cache: OrderMap | null = null;
/** `mtimeMs:size` of the file the cache was built from — see admin/store.ts. */
let cacheStamp: string | null = null;

function resolveMode(): StoreMode {
  if (mode) return mode;
  if (!isOrderStoreConfigured()) {
    mode = "disabled";
    return mode;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    mode = "file";
  } catch {
    mode = "memory";
  }
  return mode;
}

function fileStamp(): string {
  try {
    const stat = fs.statSync(ORDERS_PATH);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
}

/* ---------------------------------------------------- ADAPTER SEAM (read) */
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

/* --------------------------------------------------- ADAPTER SEAM (write) */
function writeAll(next: OrderMap): void {
  cache = next;
  if (resolveMode() !== "file") return;
  const tmp = `${ORDERS_PATH}.tmp`;
  // 0600: an order file is readable by its owner and nobody else on the box.
  fs.writeFileSync(tmp, encrypt(JSON.stringify(next)), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, ORDERS_PATH);
  cacheStamp = fileStamp();
}

/* ------------------------------------------------- ADAPTER SEAM (describe) */
export function describeOrderStore(): {
  mode: StoreMode;
  durable: boolean;
  count: number;
  note: string;
} {
  const current = resolveMode();
  let count = 0;
  try {
    count = Object.keys(readAll()).length;
  } catch {
    count = -1;
  }

  const note =
    current === "disabled"
      ? "ORDER_SIGNING_SECRET is not set, so orders are not being recorded at all. Checkout is refused rather than taking payment for an order nothing would remember."
      : current === "file"
        ? "Orders are written to data/orders.enc.json, encrypted with AES-256-GCM. Durable on a single server. Back it up, and keep ORDER_SIGNING_SECRET safe — losing it makes every stored order unreadable."
        : "This filesystem is read-only, so orders live in memory and vanish when the instance recycles. Wire a database into the adapter seam in src/lib/orders/store.ts before taking real orders here.";

  return { mode: current, durable: current === "file", count, note };
}

/* -------------------------------------------------------------------------
   Operations
   ------------------------------------------------------------------------- */

export function saveOrder(order: StoredOrder): void {
  const all = { ...readAll() };
  all[order.orderNumber] = order;
  writeAll(all);
}

export function getOrder(orderNumber: string): StoredOrder | undefined {
  return readAll()[orderNumber];
}

/** Newest first. */
export function listOrders(limit = 200): StoredOrder[] {
  return Object.values(readAll())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Find by the processor's own id, which is all a webhook reliably carries. */
export function getOrderByPaymentIntent(intentId: string): StoredOrder | undefined {
  return Object.values(readAll()).find((o) => o.paymentIntentId === intentId);
}

/**
 * Find by the payment id rather than the order id.
 *
 * Needed for refunds: a refund event carries the payment it reverses and none of
 * the notes we attached to the original order, so this is the only thread back.
 */
export function getOrderByPaymentId(paymentId: string): StoredOrder | undefined {
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
 */
export function recordPaymentOutcome(
  orderNumber: string,
  outcome: PaymentOutcome,
): { order: StoredOrder; changed: boolean } | null {
  const all = { ...readAll() };
  const existing = all[orderNumber];
  if (!existing) return null;

  if (existing.status === outcome.status) return { order: existing, changed: false };
  if (existing.status === "paid" && outcome.status === "failed") {
    return { order: existing, changed: false };
  }

  const updated: StoredOrder = {
    ...existing,
    status: outcome.status,
    updatedAt: new Date().toISOString(),
    ...(outcome.paymentId && { paymentId: outcome.paymentId }),
    ...(outcome.paymentMethod && { paymentMethod: outcome.paymentMethod }),
    ...(outcome.failureReason && { failureReason: outcome.failureReason }),
    ...(outcome.status === "paid" && { paidAt: new Date().toISOString() }),
  };

  all[orderNumber] = updated;
  writeAll(all);
  return { order: updated, changed: true };
}

/** Used by the tests. Never wired to a route — there is no "delete all orders" button. */
export function clearAllOrders(): void {
  writeAll({});
}
