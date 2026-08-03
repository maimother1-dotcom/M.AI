import "server-only";
import { products as baseProducts } from "@/data/products";
import { getCatalog } from "@/lib/admin/store";
import { getPool, type PgClient } from "@/lib/order-store";

/**
 * Inventory, and not overselling it.
 *
 * The problem this exists to solve is one line long: two people buy the last
 * piece at the same moment, both requests read `stock === 1`, both pass, and one
 * of them gets an apology instead of a dress. Reading stock and then deciding is
 * always a race. The decision has to BE the read.
 *
 * So availability is `on_hand - reserved`, and taking some is a single statement
 * with the check in its WHERE clause:
 *
 *     update stock set reserved = reserved + $qty
 *      where sku = $sku and on_hand - reserved >= $qty
 *
 * Postgres takes a row lock for the duration. The loser's update matches zero
 * rows and it is told the piece is gone — before anybody is charged.
 *
 * THE LIFECYCLE, and why it has three states rather than one:
 *
 *   reserve()     at checkout, before payment. Holds the piece.
 *   commitSale()  on capture. on_hand -= qty, reserved -= qty. It is sold.
 *   release()     on failure, cancellation, or expiry. reserved -= qty.
 *
 * Decrementing only on payment would let someone hold nothing while they pay,
 * and two people could still be charged for one piece. Decrementing only at
 * checkout would let an abandoned basket consume stock forever. Reserving, then
 * settling one way or the other, is the only version that is correct at both
 * ends — and it is why `releaseExpiredReservations()` exists, because a customer
 * who closes the tab mid-payment never tells us anything.
 *
 * POSTGRES ONLY. There is no file-backed version of this and there should not
 * be: `next start` renders in several worker processes and serverless runs many
 * instances, so a JSON file cannot make the guarantee above. Without a database
 * `isStockLedgerEnabled()` is false, nothing is reserved, and the catalogue can
 * oversell — which is the honest behaviour, and the admin says so.
 */

export interface StockLine {
  sku: string;
  quantity: number;
}

export function isStockLedgerEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

const SCHEMA = `
  create table if not exists stock (
    sku       text primary key,
    on_hand   integer not null check (on_hand >= 0),
    reserved  integer not null default 0 check (reserved >= 0),
    updated_at timestamptz not null default now()
  );
`;

let ready: Promise<void> | null = null;

/**
 * Create the table and seed it from the catalogue, once.
 *
 * Seeding is `on conflict do nothing`, so it fills in SKUs the ledger has never
 * seen and never touches a count that has been trading. A new product appears
 * with its catalogue stock; an existing one keeps whatever it has actually sold
 * down to. Re-running this on every deploy is safe, which is the point.
 */
async function ensureReady(): Promise<void> {
  ready ??= (async () => {
    const pool = await getPool();
    await pool.query(SCHEMA);

    // Read through the override-aware catalogue so an admin's stock edit made
    // before the ledger existed is what seeds it.
    const catalog = getCatalog();
    const values = catalog.map((p) => `('${p.id}', ${Math.max(0, Math.floor(p.stock))}, 0)`).join(",");
    if (values) {
      await pool.query(
        `insert into stock (sku, on_hand, reserved) values ${values}
         on conflict (sku) do nothing`,
      );
    }
  })().catch((error) => {
    // Let the next call try again rather than caching a failure forever.
    ready = null;
    throw error;
  });
  return ready;
}

/** SKU ids are `xx-000` by construction, so the seed above cannot inject SQL. */
const SKU_SHAPE = /^[a-z]{2}-\d{3}$/;
if (baseProducts.some((p) => !SKU_SHAPE.test(p.id))) {
  throw new Error("A product id does not match the expected shape; the stock seed assumes it.");
}

/* -------------------------------------------------------------------------
   Reserving
   ------------------------------------------------------------------------- */

export type ReserveResult =
  | { ok: true }
  | { ok: false; reason: "unavailable"; sku: string; available: number }
  | { ok: false; reason: "error" };

/**
 * Hold stock for an order, all lines or none.
 *
 * All-or-nothing matters: reserving two of three lines and failing the third
 * would leave the customer unable to buy while the pieces they nearly bought sit
 * held. The transaction rolls the partial work back.
 *
 * Lines are sorted by SKU before locking. Two orders containing the same two
 * products in opposite orders would otherwise each hold the row the other wants
 * and deadlock; a consistent lock order makes that impossible rather than rare.
 */
export async function reserve(lines: StockLine[]): Promise<ReserveResult> {
  if (!isStockLedgerEnabled() || lines.length === 0) return { ok: true };

  await ensureReady();
  const pool = await getPool();
  if (!pool.connect) return { ok: false, reason: "error" };
  // Bound, because `pg`'s Pool.connect uses `this` internally and a detached
  // reference throws deep inside the driver rather than at the call site.
  const connect = pool.connect.bind(pool);

  // Merge duplicate SKUs, or two lines of the same product would each be checked
  // against the full availability and together exceed it.
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.sku, (merged.get(line.sku) ?? 0) + line.quantity);
  }
  const ordered = [...merged.entries()].sort(([a], [b]) => a.localeCompare(b));

  let client: PgClient | undefined;
  try {
    client = await connect();
    await client.query("begin");

    for (const [sku, quantity] of ordered) {
      const { rows } = await client.query(
        `update stock set reserved = reserved + $2, updated_at = now()
          where sku = $1 and on_hand - reserved >= $2
        returning on_hand - reserved as remaining`,
        [sku, quantity],
      );

      if (rows.length === 0) {
        await client.query("rollback");
        // Read the remaining count on THIS connection, not from the pool.
        // Asking the pool for a second connection while holding one is how a
        // small pool deadlocks: every in-flight reserve holds one and waits for
        // another that only a peer can release. Under a burst — which is exactly
        // when this path runs — they all time out and the customer sees a 503
        // instead of "sold out".
        const current = await client.query(
          "select on_hand - reserved as available from stock where sku = $1",
          [sku],
        );
        return {
          ok: false,
          reason: "unavailable",
          sku,
          available: Math.max(0, Number(current.rows[0]?.available ?? 0)),
        };
      }
    }

    await client.query("commit");
    return { ok: true };
  } catch (error) {
    console.error("[stock] reserve failed:", error);
    try {
      await client?.query("rollback");
    } catch {
      /* the connection is already broken; releasing it is all that is left */
    }
    return { ok: false, reason: "error" };
  } finally {
    client?.release();
  }
}

/** Give held stock back. Used on payment failure, cancellation and expiry. */
export async function release(lines: StockLine[]): Promise<void> {
  if (!isStockLedgerEnabled() || lines.length === 0) return;

  await ensureReady();
  const pool = await getPool();

  for (const line of lines) {
    // `greatest(…, 0)` because a double release must not drive `reserved`
    // negative and hand out stock that does not exist. The check constraint
    // would reject it, but silently correcting is better than a 500 on a path
    // that runs during cleanup.
    await pool.query(
      `update stock set reserved = greatest(reserved - $2, 0), updated_at = now()
        where sku = $1`,
      [line.sku, line.quantity],
    );
  }
}

/** The piece is sold: it leaves both the shelf and the hold. */
export async function commitSale(lines: StockLine[]): Promise<void> {
  if (!isStockLedgerEnabled() || lines.length === 0) return;

  await ensureReady();
  const pool = await getPool();

  for (const line of lines) {
    await pool.query(
      `update stock set
         on_hand = greatest(on_hand - $2, 0),
         reserved = greatest(reserved - $2, 0),
         updated_at = now()
       where sku = $1`,
      [line.sku, line.quantity],
    );
  }
}

/* -------------------------------------------------------------------------
   Reading
   ------------------------------------------------------------------------- */

/**
 * What a customer can actually buy right now, by SKU.
 *
 * Falls back to the catalogue's own figure when there is no ledger, so callers
 * do not need to know which mode they are in — they just get the best answer
 * available.
 */
export async function availableFor(skus: string[]): Promise<Map<string, number>> {
  const catalog = getCatalog();
  const fallback = new Map(catalog.map((p) => [p.id, p.stock]));

  if (!isStockLedgerEnabled() || skus.length === 0) {
    return new Map(skus.map((sku) => [sku, fallback.get(sku) ?? 0]));
  }

  try {
    await ensureReady();
    const pool = await getPool();
    const { rows } = await pool.query(
      "select sku, on_hand - reserved as available from stock where sku = any($1)",
      [skus],
    );

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(String(row.sku), Math.max(0, Number(row.available)));
    }
    // A SKU the ledger has never seen (added since the last seed) falls back
    // rather than reading as sold out.
    for (const sku of skus) {
      if (!result.has(sku)) result.set(sku, fallback.get(sku) ?? 0);
    }
    return result;
  } catch (error) {
    console.error("[stock] availability read failed:", error);
    return new Map(skus.map((sku) => [sku, fallback.get(sku) ?? 0]));
  }
}

/**
 * Put returned pieces back on the shelf.
 *
 * An increment, not a set. `availableFor()` reports `on_hand - reserved`, so
 * reading that and writing it back as `on_hand` would silently erase every hold
 * a checkout in progress was relying on. The only safe restock is one Postgres
 * does arithmetic on.
 */
export async function restock(lines: StockLine[]): Promise<void> {
  if (!isStockLedgerEnabled() || lines.length === 0) return;
  await ensureReady();
  const pool = await getPool();
  for (const line of lines) {
    await pool.query(
      "update stock set on_hand = on_hand + $2, updated_at = now() where sku = $1",
      [line.sku, Math.max(0, Math.floor(line.quantity))],
    );
  }
}

/** Set the shelf count directly. The admin's stock field writes through here. */
export async function setOnHand(sku: string, onHand: number): Promise<void> {
  if (!isStockLedgerEnabled()) return;
  await ensureReady();
  const pool = await getPool();
  await pool.query(
    `insert into stock (sku, on_hand, reserved) values ($1, $2, 0)
     on conflict (sku) do update set on_hand = excluded.on_hand, updated_at = now()`,
    [sku, Math.max(0, Math.floor(onHand))],
  );
}

/* -------------------------------------------------------------------------
   Expiry
   ------------------------------------------------------------------------- */

/** How long a checkout may hold stock before paying for it. */
export function reservationMinutes(): number {
  const raw = Number(process.env.STOCK_RESERVATION_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

/**
 * Total held across the ledger, for the admin.
 *
 * A number that keeps climbing while sales do not means reservations are leaking
 * — abandoned checkouts that nothing has released. That is the symptom worth
 * watching, so it is worth showing.
 */
export async function reservedTotal(): Promise<number> {
  if (!isStockLedgerEnabled()) return 0;
  try {
    await ensureReady();
    const pool = await getPool();
    const { rows } = await pool.query("select coalesce(sum(reserved), 0)::int as n from stock");
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
