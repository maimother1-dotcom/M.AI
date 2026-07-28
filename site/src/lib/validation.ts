import { z } from "zod";
import { MAX_LINES_PER_CART, MAX_QUANTITY_PER_LINE } from "@/lib/pricing";

/**
 * Every API route validates its body against a schema here before touching it.
 *
 * Note what the cart line schema does NOT accept: price, total, discount, tax.
 * `.strict()` means a request that includes them is rejected outright rather
 * than silently ignored, which turns a probing attempt into a 400 instead of a
 * quiet no-op.
 */

export const cartLineSchema = z
  .object({
    sku: z.string().min(1).max(40).regex(/^[a-z]{2}-\d{3}$/, "Malformed SKU"),
    quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
    size: z.string().min(1).max(20),
    colorway: z.string().min(1).max(40),
  })
  .strict();

export const shippingMethodSchema = z.enum(["standard", "express"]);

export const addressSchema = z
  .object({
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).optional().or(z.literal("")),
    city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    postalCode: z.string().trim().min(3).max(12).regex(/^[A-Za-z0-9\s-]+$/),
    country: z.string().trim().min(2).max(60),
  })
  .strict();

export const checkoutSchema = z
  .object({
    lines: z.array(cartLineSchema).min(1).max(MAX_LINES_PER_CART),
    shippingMethod: shippingMethodSchema,
    // A code, never an amount. The server decides what it is worth.
    promoCode: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().email().max(254),
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(6).max(20).regex(/^[+0-9\s()-]+$/),
    shippingAddress: addressSchema,
    /** Honeypot. Real browsers leave it empty; most bots fill every field. */
    website: z.string().max(0).optional(),
  })
  .strict();

export const quoteSchema = z
  .object({
    lines: z.array(cartLineSchema).min(1).max(MAX_LINES_PER_CART),
    shippingMethod: shippingMethodSchema,
    promoCode: z.string().trim().max(32).optional().nullable(),
  })
  .strict();

export const newsletterSchema = z
  .object({
    email: z.string().trim().email().max(254),
    website: z.string().max(0).optional(),
  })
  .strict();

export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    subject: z.string().trim().min(2).max(120),
    message: z.string().trim().min(10).max(4000),
    website: z.string().max(0).optional(),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Uniform error shape. Never echoes back the offending value. */
export function validationError(error: z.ZodError) {
  const first = error.issues[0];
  return {
    error: "INVALID_REQUEST",
    message: first ? `${first.path.join(".") || "request"}: ${first.message}` : "Invalid request.",
  };
}
