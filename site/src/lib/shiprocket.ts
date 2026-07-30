import "server-only";
import crypto from "node:crypto";

/**
 * Shiprocket — the courier aggregator.
 *
 * One integration reaches Delhivery, Bluedart, Ekart, Xpressbees and the rest,
 * which for a boutique shipping a few dozen parcels a week is the difference
 * between negotiating with five couriers and negotiating with none.
 *
 * No SDK, for the same reason there is no Razorpay SDK: this is four endpoints
 * and a bearer token, and a dependency here would put supply-chain risk on the
 * path that handles every customer's home address.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO:
 *
 *   - It never decides that an order is paid. That is `recordPaymentOutcome()`,
 *     driven by a verified webhook. Shipping is downstream of payment and must
 *     never be able to reach back and assert one.
 *   - It never blocks a customer. Every call here is best-effort from the
 *     customer's point of view: if Shiprocket is down, the order is still paid,
 *     still recorded, and still visible in the admin to push manually.
 */

const API_BASE = "https://apiv2.shiprocket.in/v1/external";

export interface ShiprocketConfig {
  email: string;
  password: string;
  /** The nickname of a pickup address configured in the Shiprocket dashboard. */
  pickupLocation: string;
  channelId?: string;
}

export function getShiprocketConfig(): ShiprocketConfig | null {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION;
  if (!email || !password || !pickupLocation) return null;
  return {
    email,
    password,
    pickupLocation,
    ...(process.env.SHIPROCKET_CHANNEL_ID && { channelId: process.env.SHIPROCKET_CHANNEL_ID }),
  };
}

export function isShiprocketEnabled(): boolean {
  return getShiprocketConfig() !== null;
}

/* -------------------------------------------------------------------------
   Authentication
   ------------------------------------------------------------------------- */

/**
 * Shiprocket issues a JWT valid for ten days and rate-limits the login endpoint
 * hard. Logging in per request would get the account throttled within an hour of
 * any real traffic, so the token is cached and refreshed with a day to spare.
 *
 * Cached per process, which on serverless means per warm instance. That is
 * correct: the token is not secret to us, it is just expensive to mint, and a
 * cold start paying for one login is fine.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  // Collapse concurrent refreshes. Without this, ten simultaneous webhook
  // deliveries after a cold start would fire ten logins and trip the rate limit.
  inFlight ??= (async () => {
    const config = getShiprocketConfig();
    if (!config) throw new Error("Shiprocket is not configured");

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });

    if (!response.ok) {
      // Never log the body: a failed login response can echo the credentials.
      throw new Error(`Shiprocket login failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) throw new Error("Shiprocket login returned no token");

    cachedToken = { token: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return data.token;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Drop the cached token. Called when Shiprocket rejects it as expired. */
function invalidateToken(): void {
  cachedToken = null;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  retryOn401 = true,
): Promise<T> {
  const token = await getToken();

  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

  // A ten-day token can expire mid-life if the account's password changes.
  // One retry with a fresh token, then give up rather than loop.
  if (response.status === 401 && retryOn401) {
    invalidateToken();
    return call<T>(path, init, false);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Shiprocket ${path} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Shiprocket ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/* -------------------------------------------------------------------------
   Orders
   ------------------------------------------------------------------------- */

export interface ShiprocketOrderInput {
  orderNumber: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: { name: string; sku: string; units: number; sellingPrice: number }[];
  /** Order subtotal in MAJOR units — Shiprocket wants rupees, not paise. */
  subTotal: number;
  parcel: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
  /** We do not offer COD, so this is always Prepaid — but the field is required. */
  paymentMethod?: "Prepaid" | "COD";
}

export interface ShiprocketOrderResult {
  orderId: number;
  shipmentId: number;
  status?: string;
}

/**
 * Split a full name into the first/last pair Shiprocket insists on.
 *
 * "Priya" alone is a perfectly normal way to be named, and Shiprocket rejects an
 * empty last name, so a single-word name repeats rather than failing. That is
 * ugly on a label and better than an undeliverable parcel.
 */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

/**
 * Reduce a phone number to the ten digits Shiprocket expects.
 *
 * Customers type +91, 0091, spaces and hyphens. Shiprocket wants bare digits and
 * silently mangles anything else, which surfaces as a courier unable to call
 * about a delivery.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function createShiprocketOrder(
  input: ShiprocketOrderInput,
): Promise<ShiprocketOrderResult> {
  const config = getShiprocketConfig();
  if (!config) throw new Error("Shiprocket is not configured");

  const { first, last } = splitName(input.name);

  const payload = {
    // Our order number, so the two systems agree on identity. Shiprocket rejects
    // a duplicate, which is exactly the idempotency we want.
    order_id: input.orderNumber,
    order_date: input.createdAt.slice(0, 19).replace("T", " "),
    pickup_location: config.pickupLocation,
    ...(config.channelId && { channel_id: config.channelId }),

    billing_customer_name: first,
    billing_last_name: last,
    billing_address: input.address.line1,
    ...(input.address.line2 && { billing_address_2: input.address.line2 }),
    billing_city: input.address.city,
    billing_pincode: input.address.postalCode,
    billing_state: input.address.state,
    billing_country: input.address.country === "IN" ? "India" : input.address.country,
    billing_email: input.email,
    billing_phone: normalisePhone(input.phone),
    shipping_is_billing: true,

    order_items: input.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.units,
      selling_price: item.sellingPrice,
    })),

    payment_method: input.paymentMethod ?? "Prepaid",
    sub_total: input.subTotal,

    length: input.parcel.lengthCm,
    breadth: input.parcel.breadthCm,
    height: input.parcel.heightCm,
    weight: input.parcel.weightKg,
  };

  const result = await call<{ order_id: number; shipment_id: number; status?: string }>(
    "/orders/create/adhoc",
    { method: "POST", body: payload },
  );

  if (!result.order_id || !result.shipment_id) {
    throw new Error(`Shiprocket created no shipment: ${JSON.stringify(result).slice(0, 200)}`);
  }

  return { orderId: result.order_id, shipmentId: result.shipment_id, status: result.status };
}

export interface AwbResult {
  awbCode: string;
  courierName: string;
}

/**
 * Assign a courier and get an air waybill.
 *
 * Shiprocket picks the courier by its own rules unless one is named. Leaving it
 * to them is right for a small shipper: their recommendation accounts for
 * serviceability at the destination pincode, which we have no way to evaluate.
 */
export async function assignAwb(shipmentId: number): Promise<AwbResult> {
  const result = await call<{
    response?: { data?: { awb_code?: string; courier_name?: string } };
  }>("/courier/assign/awb", { method: "POST", body: { shipment_id: shipmentId } });

  const awbCode = result.response?.data?.awb_code;
  const courierName = result.response?.data?.courier_name;

  if (!awbCode) {
    // Usually means no courier serves that pincode, or the wallet is empty.
    throw new Error(`Shiprocket assigned no AWB: ${JSON.stringify(result).slice(0, 300)}`);
  }

  return { awbCode, courierName: courierName ?? "Courier" };
}

export interface TrackingSnapshot {
  status: string;
  currentStatus?: string;
  deliveredAt?: string;
  trackingUrl?: string;
}

export async function trackShipment(shipmentId: number): Promise<TrackingSnapshot | null> {
  try {
    const result = await call<{
      tracking_data?: {
        track_status?: number;
        shipment_status?: string;
        shipment_track?: { current_status?: string; delivered_date?: string }[];
        track_url?: string;
      };
    }>(`/courier/track/shipment/${shipmentId}`, { method: "GET" });

    const data = result.tracking_data;
    if (!data) return null;

    const track = data.shipment_track?.[0];
    return {
      status: String(data.shipment_status ?? "unknown"),
      ...(track?.current_status && { currentStatus: track.current_status }),
      ...(track?.delivered_date && { deliveredAt: track.delivered_date }),
      ...(data.track_url && { trackingUrl: data.track_url }),
    };
  } catch (error) {
    console.error(`[shiprocket] tracking ${shipmentId} failed:`, error);
    return null;
  }
}

/**
 * The customer-facing tracking link.
 *
 * Shiprocket's own page rather than the courier's, because it stays the same URL
 * if the courier changes and it does not require the customer to know which
 * courier they were assigned.
 */
export function trackingUrlFor(awbCode: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}`;
}

/* -------------------------------------------------------------------------
   Webhook authentication
   ------------------------------------------------------------------------- */

/**
 * Shiprocket authenticates its webhooks with a shared token in `x-api-key`, not
 * a signature over the body. That is weaker than Razorpay's HMAC — it proves the
 * sender knows the token, not that the body is untouched — so the handler treats
 * webhook contents as a hint to go and check, never as fact.
 *
 * Compared in constant time regardless, because a plain `===` on a secret leaks
 * its length and prefix to anyone willing to make enough requests.
 */
export function verifyWebhookToken(provided: string | null | undefined): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
