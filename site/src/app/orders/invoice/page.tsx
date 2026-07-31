import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildInvoice, type Invoice } from "@/lib/invoice";
import { getOrder, isOrderStoreConfigured } from "@/lib/order-store";
import { verifyOrderAccess } from "@/lib/order-access";
import { displayPrice } from "@/lib/currency";
import { COMPLIANCE } from "@/data/compliance";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * The tax invoice, as a page rather than a PDF.
 *
 * A print stylesheet and the browser's own "Save as PDF" gets the customer an
 * identical document without adding a PDF renderer to the dependency tree — and
 * this is the path that handles names, addresses and tax identifiers, which is
 * the last place to want an extra library. It also means the invoice is a URL
 * the customer can revisit rather than an attachment they have to keep.
 *
 * Access is the short-lived token from `/api/orders/lookup`, which the customer
 * only receives after proving they know both the order number and the email it
 * was placed with.
 */
export default async function InvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  if (!isOrderStoreConfigured()) notFound();

  const { t } = await searchParams;
  const orderNumber = verifyOrderAccess(t);
  if (!orderNumber) notFound();

  const order = await getOrder(orderNumber);
  // Only a paid order has an invoice. A pending one is not a sale yet.
  if (!order || order.status !== "paid") notFound();

  const invoice = buildInvoice(order, order.invoiceNumber ?? null);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="/orders/track" className="link-underline text-xs">
          ← Back to your order
        </a>
        <span className="text-xs text-ink-muted">Ctrl / Cmd + P to save as PDF</span>
      </div>

      <article className="border border-line bg-white p-8 text-[13px] leading-relaxed print:border-0 print:p-0">
        <Header invoice={invoice} />
        <Parties invoice={invoice} />
        <Lines invoice={invoice} />
        <Totals invoice={invoice} />
        <Footer invoice={invoice} />
      </article>
    </main>
  );
}

function Header({ invoice }: { invoice: Invoice }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
      <div>
        <p className="font-display text-xl tracking-[0.2em]">L&apos;INDIENNE</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          {invoice.isTaxInvoice ? "Tax invoice" : "Bill of supply"}
        </p>
      </div>
      <dl className="text-right text-xs">
        <div className="flex justify-end gap-3">
          <dt className="text-ink-muted">Invoice no.</dt>
          <dd className="font-mono">{invoice.number ?? "Not yet issued"}</dd>
        </div>
        <div className="mt-1 flex justify-end gap-3">
          <dt className="text-ink-muted">Date</dt>
          <dd>{new Date(invoice.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</dd>
        </div>
        <div className="mt-1 flex justify-end gap-3">
          <dt className="text-ink-muted">Order</dt>
          <dd className="font-mono">{invoice.order.number}</dd>
        </div>
      </dl>
    </header>
  );
}

function Parties({ invoice }: { invoice: Invoice }) {
  return (
    <div className="mb-8 grid gap-8 sm:grid-cols-2">
      <section>
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-muted">Supplier</p>
        <p className="font-medium">{invoice.supplier.legalName}</p>
        {invoice.supplier.tradeName !== invoice.supplier.legalName && (
          <p className="text-ink-soft">trading as {invoice.supplier.tradeName}</p>
        )}
        <p className="mt-1 text-ink-soft">{invoice.supplier.address}</p>
        {invoice.isTaxInvoice && (
          <p className="mt-2">
            <span className="text-ink-muted">GSTIN </span>
            <span className="font-mono">{invoice.supplier.gstin}</span>
          </p>
        )}
        <p className="text-ink-soft">State: {invoice.supplier.state}</p>
      </section>

      <section>
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          Recipient / Bill and ship to
        </p>
        <p className="font-medium">{invoice.recipient.name}</p>
        {invoice.recipient.address.map((line) => (
          <p key={line} className="text-ink-soft">
            {line}
          </p>
        ))}
        <p className="mt-2">
          <span className="text-ink-muted">Place of supply: </span>
          {invoice.placeOfSupply}
        </p>
      </section>
    </div>
  );
}

function Lines({ invoice }: { invoice: Invoice }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-y border-line text-[10px] uppercase tracking-[0.1em] text-ink-muted">
            <th className="py-2 pr-3 font-normal">Description</th>
            <th className="py-2 pr-3 font-normal">HSN</th>
            <th className="py-2 pr-3 text-right font-normal">Qty</th>
            <th className="py-2 pr-3 text-right font-normal">Taxable</th>
            <th className="py-2 pr-3 text-right font-normal">Rate</th>
            {invoice.intraState ? (
              <>
                <th className="py-2 pr-3 text-right font-normal">CGST</th>
                <th className="py-2 text-right font-normal">SGST</th>
              </>
            ) : (
              <th className="py-2 text-right font-normal">IGST</th>
            )}
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr key={`${line.description}-${i}`} className="border-b border-line/60">
              <td className="py-2.5 pr-3">{line.description}</td>
              <td className="py-2.5 pr-3 font-mono text-[11px]">{line.hsn}</td>
              <td className="py-2.5 pr-3 text-right tabular">{line.quantity}</td>
              <td className="py-2.5 pr-3 text-right tabular">{displayPrice(line.taxableMinor)}</td>
              <td className="py-2.5 pr-3 text-right tabular">{line.rateBps / 100}%</td>
              {invoice.intraState ? (
                <>
                  <td className="py-2.5 pr-3 text-right tabular">{displayPrice(line.cgstMinor)}</td>
                  <td className="py-2.5 text-right tabular">{displayPrice(line.sgstMinor)}</td>
                </>
              ) : (
                <td className="py-2.5 text-right tabular">{displayPrice(line.igstMinor)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totals({ invoice }: { invoice: Invoice }) {
  const rows: [string, string][] = [
    ["Taxable value", displayPrice(invoice.totals.taxableMinor)],
    ...(invoice.intraState
      ? ([
          ["CGST", displayPrice(invoice.totals.cgstMinor)],
          ["SGST", displayPrice(invoice.totals.sgstMinor)],
        ] as [string, string][])
      : ([["IGST", displayPrice(invoice.totals.igstMinor)]] as [string, string][])),
    ...(invoice.totals.roundOffMinor !== 0
      ? ([["Round off", displayPrice(invoice.totals.roundOffMinor)]] as [string, string][])
      : []),
  ];

  return (
    <div className="mt-6 flex flex-col items-end gap-1">
      <dl className="w-full max-w-xs text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-1">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="tabular">{value}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-sm font-medium">
          <dt>Total</dt>
          <dd className="tabular">{displayPrice(invoice.totals.grandTotalMinor)}</dd>
        </div>
      </dl>
      <p className="mt-3 max-w-md text-right text-[11px] text-ink-soft">
        <span className="text-ink-muted">In words: </span>
        {invoice.amountInWords}
      </p>
    </div>
  );
}

function Footer({ invoice }: { invoice: Invoice }) {
  return (
    <footer className="mt-10 border-t border-line pt-5 text-[11px] leading-relaxed text-ink-muted">
      {!invoice.isTaxInvoice && (
        <p className="mb-3 text-ink-soft">
          This is a bill of supply and not a tax invoice. No GST has been charged separately,
          because this supplier is not registered under GST.
        </p>
      )}
      <p>
        Payment received via {invoice.order.paymentMode}
        {invoice.order.paymentId && ` · reference ${invoice.order.paymentId}`}. All amounts are in
        Indian Rupees and are inclusive of tax where shown.
      </p>
      <p className="mt-2">
        Queries: {COMPLIANCE.consumerCareEmail}
        {!COMPLIANCE.consumerCarePhone.includes("[") && ` · ${COMPLIANCE.consumerCarePhone}`}
      </p>
      <p className="mt-3">
        {invoice.isTaxInvoice
          ? "Computer generated invoice. No signature required."
          : "Computer generated document."}
      </p>
    </footer>
  );
}
