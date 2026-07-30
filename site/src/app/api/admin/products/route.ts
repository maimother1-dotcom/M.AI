import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/guard";
import { setOnHand } from "@/lib/stock";
import {
  clearOverride,
  describeStore,
  getCatalog,
  getOverrides,
  saveOverride,
} from "@/lib/admin/store";

/**
 * Push an edit out to the prerendered pages.
 *
 * Product and shop pages are statically generated. Without this, an edit would
 * change what checkout CHARGES while the page kept showing the old figure —
 * a customer seeing one price and being billed another. That is the worst bug
 * this feature could ship, so every write calls it.
 */
function revalidateStorefront(slug: string, category: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath(`/shop/${category}`);
  revalidatePath(`/product/${slug}`);
}

/**
 * Read and edit the catalog.
 *
 * The validation here is not just shape-checking. Prices are bounded, stock is
 * bounded, and a compare-at below the sale price is rejected — because the whole
 * proposition rests on that number, and a fat-fingered edit that shows a
 * NEGATIVE saving on the storefront is worse than a rejected form.
 */

export const runtime = "nodejs";

const BADGES = ["new", "bestseller", "last-few", "editors-pick"] as const;

/** ₹1 to ₹10,00,000, in paise. Wide enough for anything real, narrow enough to catch a slip. */
const MONEY = z.number().int().min(100).max(100_000_000);

const patchSchema = z
  .object({
    id: z.string().regex(/^[a-z]{2}-\d{3}$/),
    name: z.string().trim().min(2).max(120).optional(),
    summary: z.string().trim().min(5).max(300).optional(),
    priceMinor: MONEY.optional(),
    compareAtMinor: MONEY.optional(),
    stock: z.number().int().min(0).max(100_000).optional(),
    badges: z.array(z.enum(BADGES)).max(4).optional(),
    image: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    products: getCatalog(),
    overrides: getOverrides(),
    store: describeStore(),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid request.",
      },
      { status: 400 },
    );
  }

  const { id, ...patch } = parsed.data;

  // Cross-field check: the comparison price must exceed what we charge, or the
  // saving badge renders as a negative number on every card.
  const current = getCatalog().find((p) => p.id === id);
  if (!current) {
    return NextResponse.json({ error: "NOT_FOUND", message: "No such product." }, { status: 404 });
  }
  const nextPrice = patch.priceMinor ?? current.priceMinor;
  const nextCompare = patch.compareAtMinor ?? current.compareAtMinor;
  if (nextCompare <= nextPrice) {
    return NextResponse.json(
      {
        error: "INVALID_PRICING",
        message: "The comparison price must be higher than the selling price.",
      },
      { status: 400 },
    );
  }

  // An image must be a real path or https URL — never javascript: or data:,
  // which would put an XSS vector into a product page.
  if (patch.image) {
    const value = patch.image;
    const safe = value.startsWith("/") || value.startsWith("https://");
    if (!safe) {
      return NextResponse.json(
        {
          error: "INVALID_IMAGE",
          message: "Image must be a local path starting with / or an https:// URL.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const updated = saveOverride(id, patch);

    // Keep the inventory ledger in step. Without this an admin could set stock
    // to 50 and the checkout would still refuse, because the ledger is what
    // actually gates a sale.
    if (patch.stock !== undefined) await setOnHand(id, patch.stock);

    revalidateStorefront(updated.slug, updated.category);
    console.info(`[admin] ${auth.subject} updated ${id}`);
    return NextResponse.json({ product: updated, store: describeStore() });
  } catch (error) {
    console.error("[admin] failed to save override:", error);
    return NextResponse.json(
      { error: "SAVE_FAILED", message: "Could not save. See server logs." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[a-z]{2}-\d{3}$/.test(id)) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const restored = clearOverride(id);
  if (!restored) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Reverting the override returns the committed stock figure, so the ledger
  // follows it back.
  await setOnHand(id, restored.stock);

  revalidateStorefront(restored.slug, restored.category);
  console.info(`[admin] ${auth.subject} reverted ${id} to the committed catalog`);
  return NextResponse.json({ product: restored, store: describeStore() });
}
