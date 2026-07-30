import "server-only";
import { COMPLIANCE } from "@/data/compliance";
import { displayPrice } from "@/lib/currency";
import { deliveryEstimate } from "@/lib/orders";
import type { StoredOrder } from "@/lib/order-store";
import type { Email } from "@/lib/email";

/**
 * The two emails a customer actually wants.
 *
 * Written as inline-styled tables rather than anything modern, because email
 * clients are not browsers: Outlook renders with Word's engine, Gmail strips
 * <style> blocks in some contexts, and flexbox is a coin toss. This is dull on
 * purpose and it arrives looking right.
 *
 * Every email has a plain-text part. Some people read mail as text, some clients
 * fall back to it, and spam filters treat its absence as a signal.
 */

const IVORY = "#F8F5EF";
const INK = "#16130F";
const MUTED = "#6B6459";
const LINE = "#E2DCD1";
const MADDER = "#9C3A2C";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressLines(order: StoredOrder): string[] {
  const a = order.shippingAddress;
  return [
    order.name,
    a.line1,
    ...(a.line2 ? [a.line2] : []),
    `${a.city}, ${a.state} ${a.postalCode}`,
    a.country === "IN" ? "India" : a.country,
  ];
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${IVORY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINE};">
  <tr><td style="padding:28px 32px;border-bottom:1px solid ${LINE};text-align:center;">
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.22em;color:${INK};">L'INDIENNE</span>
    <div style="font-family:Georgia,serif;font-size:11px;color:${MUTED};letter-spacing:0.1em;margin-top:6px;">Paris fell for India first</div>
  </td></tr>
  <tr><td style="padding:32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:${INK};">
    <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:24px;font-weight:normal;color:${INK};">${escapeHtml(title)}</h1>
    ${body}
  </td></tr>
  <tr><td style="padding:24px 32px;border-top:1px solid ${LINE};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:${MUTED};">
    Questions? Reply to this email, or write to ${escapeHtml(COMPLIANCE.consumerCareEmail)}.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function itemsTable(order: StoredOrder): string {
  const rows = order.lines
    .map(
      (line) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};">
        <div>${escapeHtml(line.name)}</div>
        <div style="font-size:12px;color:${MUTED};">${escapeHtml(line.size)} · ${escapeHtml(line.colorway)} · ${line.quantity} ×</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;">${displayPrice(line.lineTotalMinor)}</td>
    </tr>`,
    )
    .join("");

  const totals = [
    ["Subtotal", displayPrice(order.totals.subtotalMinor)],
    ...(order.totals.discountMinor > 0
      ? [["Discount", `−${displayPrice(order.totals.discountMinor)}`]]
      : []),
    ["Shipping", order.totals.shippingMinor === 0 ? "Complimentary" : displayPrice(order.totals.shippingMinor)],
    ["GST", displayPrice(order.totals.taxMinor)],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0;color:${MUTED};">${label}</td><td style="padding:4px 0;text-align:right;">${value}</td></tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    ${rows}
    ${totals}
    <tr>
      <td style="padding:12px 0 0;border-top:1px solid ${LINE};font-weight:600;">Total paid</td>
      <td style="padding:12px 0 0;border-top:1px solid ${LINE};text-align:right;font-weight:600;">${displayPrice(order.totals.totalMinor)}</td>
    </tr>
  </table>`;
}

function textItems(order: StoredOrder): string {
  return order.lines
    .map(
      (line) =>
        `  ${line.quantity} × ${line.name} (${line.size}, ${line.colorway})  ${displayPrice(line.lineTotalMinor)}`,
    )
    .join("\n");
}

/* -------------------------------------------------------------------------
   1. Order confirmation
   ------------------------------------------------------------------------- */

export function orderConfirmationEmail(order: StoredOrder): Email {
  const address = addressLines(order);
  const eta = deliveryEstimate(order.shippingMethod);

  const html = shell(
    "Thank you — your order is confirmed",
    `<p style="margin:0 0 20px;">We have your order and we are getting it ready. You will hear from us again the moment it is with the courier.</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${IVORY};">
       <tr><td style="padding:16px;">
         <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">Order number</div>
         <div style="font-family:monospace;font-size:16px;margin-top:4px;">${escapeHtml(order.orderNumber)}</div>
         <div style="font-size:12px;color:${MUTED};margin-top:10px;">Estimated delivery ${escapeHtml(eta)}</div>
       </td></tr>
     </table>

     ${itemsTable(order)}

     <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};margin:24px 0 8px;">Delivering to</div>
     <div style="color:${INK};">${address.map(escapeHtml).join("<br>")}</div>

     <p style="margin:24px 0 0;font-size:12px;color:${MUTED};">
       All prices are MRP, inclusive of all taxes. Thirty-day returns on unworn pieces with tags attached;
       beauty is returnable unopened only, for hygiene reasons.
     </p>`,
  );

  const text = `Thank you — your order is confirmed

Order ${order.orderNumber}
Estimated delivery ${eta}

${textItems(order)}

Subtotal      ${displayPrice(order.totals.subtotalMinor)}
${order.totals.discountMinor > 0 ? `Discount      −${displayPrice(order.totals.discountMinor)}\n` : ""}Shipping      ${order.totals.shippingMinor === 0 ? "Complimentary" : displayPrice(order.totals.shippingMinor)}
GST           ${displayPrice(order.totals.taxMinor)}
Total paid    ${displayPrice(order.totals.totalMinor)}

Delivering to
${address.join("\n")}

All prices are MRP, inclusive of all taxes.
Questions? Reply to this email, or write to ${COMPLIANCE.consumerCareEmail}.

L'INDIENNE — Paris fell for India first`;

  return {
    to: order.email,
    subject: `Your L'INDIENNE order ${order.orderNumber}`,
    html,
    text,
    replyTo: COMPLIANCE.consumerCareEmail,
  };
}

/* -------------------------------------------------------------------------
   2. Despatch
   ------------------------------------------------------------------------- */

export function despatchEmail(order: StoredOrder): Email | null {
  // Nothing useful to say without a tracking number, and an email that says
  // "it shipped" with no way to check is worse than no email.
  if (!order.awbCode) return null;

  const courier = order.courierName ?? "our courier";
  const url = order.trackingUrl ?? "";

  const html = shell(
    "Your order is on its way",
    `<p style="margin:0 0 20px;">${escapeHtml(courier)} has your parcel.</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${IVORY};">
       <tr><td style="padding:16px;">
         <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">Tracking number</div>
         <div style="font-family:monospace;font-size:16px;margin-top:4px;">${escapeHtml(order.awbCode)}</div>
         <div style="font-size:12px;color:${MUTED};margin-top:6px;">Order ${escapeHtml(order.orderNumber)} · ${escapeHtml(courier)}</div>
       </td></tr>
     </table>

     ${
       url
         ? `<p style="margin:0 0 24px;">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:${INK};color:${IVORY};padding:12px 24px;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">Track your parcel</a>
            </p>`
         : ""
     }

     <p style="margin:0;font-size:12px;color:${MUTED};">
       Tracking can take a few hours to show its first scan. If nothing appears by tomorrow,
       write to <span style="color:${MADDER};">${escapeHtml(COMPLIANCE.consumerCareEmail)}</span> and we will chase it.
     </p>`,
  );

  const text = `Your order is on its way

${courier} has your parcel.

Order      ${order.orderNumber}
Tracking   ${order.awbCode}
${url ? `Track it   ${url}\n` : ""}
Tracking can take a few hours to show its first scan. If nothing appears by
tomorrow, write to ${COMPLIANCE.consumerCareEmail} and we will chase it.

L'INDIENNE — Paris fell for India first`;

  return {
    to: order.email,
    subject: `Your L'INDIENNE order ${order.orderNumber} has shipped`,
    html,
    text,
    replyTo: COMPLIANCE.consumerCareEmail,
  };
}
