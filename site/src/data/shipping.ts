import type { CategorySlug, Product } from "@/lib/types";

/**
 * Parcel dimensions and weight.
 *
 * Shiprocket will not accept an order without them, and a courier charges on
 * whichever is greater: actual weight, or volumetric weight derived from the box
 * (L×B×H ÷ 5000 in kilograms). Understate either and the courier reweighs at the
 * hub and bills the difference back to you, usually with a penalty.
 *
 * So these are deliberately generous rather than optimistic. The right fix is to
 * weigh your actual packed parcels and set `parcel` per product; until then a
 * category default that is slightly too big costs a few rupees, while one that is
 * too small costs a reconciliation dispute.
 */

export interface Parcel {
  /** Dead weight of the packed parcel, in kilograms. */
  weightKg: number;
  /** Outer box, in centimetres. */
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

const BY_CATEGORY: Record<CategorySlug, Parcel> = {
  // A folded garment in a rigid mailer.
  clothing: { weightKg: 0.7, lengthCm: 35, breadthCm: 27, heightCm: 8 },
  // Handbags ship in a dust bag inside a box, and the box drives the cost.
  bags: { weightKg: 1.4, lengthCm: 40, breadthCm: 32, heightCm: 18 },
  // A shoebox inside an outer carton.
  shoes: { weightKg: 1.3, lengthCm: 36, breadthCm: 24, heightCm: 14 },
  // Small and light, but boxed for protection.
  jewellery: { weightKg: 0.3, lengthCm: 16, breadthCm: 12, heightCm: 7 },
  // Liquids and glass: heavier than they look, and padded.
  beauty: { weightKg: 0.5, lengthCm: 20, breadthCm: 15, heightCm: 10 },
  accessories: { weightKg: 0.4, lengthCm: 26, breadthCm: 20, heightCm: 8 },
};

export function parcelFor(product: Pick<Product, "category" | "parcel">): Parcel {
  return product.parcel ?? BY_CATEGORY[product.category];
}

/**
 * One parcel for a whole order.
 *
 * Weight adds up; the box does not. Two dresses do not go in a box twice as
 * long, they go in a slightly deeper one — so dimensions take the largest of
 * each and grow the height, which is roughly how a packer actually fills a
 * carton. It is an approximation, and it is the conservative direction.
 */
export function parcelForOrder(items: { parcel: Parcel; quantity: number }[]): Parcel {
  if (items.length === 0) {
    return { weightKg: 0.5, lengthCm: 25, breadthCm: 20, heightCm: 10 };
  }

  let weightKg = 0;
  let lengthCm = 0;
  let breadthCm = 0;
  let heightCm = 0;

  for (const item of items) {
    weightKg += item.parcel.weightKg * item.quantity;
    lengthCm = Math.max(lengthCm, item.parcel.lengthCm);
    breadthCm = Math.max(breadthCm, item.parcel.breadthCm);
    heightCm += item.parcel.heightCm * item.quantity;
  }

  return {
    // Shiprocket rejects a weight of zero and rounds to two decimals anyway.
    weightKg: Math.max(0.1, Math.round(weightKg * 100) / 100),
    lengthCm: Math.max(1, Math.ceil(lengthCm)),
    breadthCm: Math.max(1, Math.ceil(breadthCm)),
    // A stack of six shoeboxes is not 84cm tall in practice; cap it at something
    // a courier would actually see, and let weight carry the rest.
    heightCm: Math.max(1, Math.min(60, Math.ceil(heightCm))),
  };
}
