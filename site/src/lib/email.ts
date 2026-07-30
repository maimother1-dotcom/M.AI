import "server-only";

/**
 * Sending mail.
 *
 * Deliberately one function and one provider. A transactional email is a POST
 * with an API key; wrapping that in an SDK, or building an abstraction over four
 * providers nobody will switch between, would be more code to audit on a path
 * that handles every customer's address.
 *
 * ADAPTER SEAM: `deliver()` is the only place that talks to a provider. Swap its
 * body for SES, Postmark or SMTP and nothing above it changes.
 *
 * With nothing configured this logs instead of sending, and says so. That keeps
 * local development and the demo honest — a silent no-op would let "the customer
 * gets an email" quietly become false.
 */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export type EmailMode = "resend" | "log";

export function getEmailMode(): EmailMode {
  return process.env.RESEND_API_KEY ? "resend" : "log";
}

export function isEmailConfigured(): boolean {
  return getEmailMode() !== "log";
}

/** The From address. Must be a domain verified with the provider, or it bounces. */
function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "L'INDIENNE <orders@lindienne.com>";
}

/* ------------------------------------------------------------ ADAPTER SEAM */
async function deliver(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(
      `[email] not configured — would have sent "${email.subject}" to ${email.to}. ` +
        "Set RESEND_API_KEY and EMAIL_FROM to send for real.",
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo && { reply_to: email.replyTo }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email send failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
  }
}

/**
 * Send, and never throw at the caller.
 *
 * Every caller is on a path where the customer has already paid. Failing their
 * receipt, or making a payment webhook return non-200 and be retried, because a
 * mail provider had a bad minute would be the wrong trade every time. Returns
 * whether it went, so the caller can decide whether to record it as sent.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  try {
    await deliver(email);
    return true;
  } catch (error) {
    console.error(`[email] could not send "${email.subject}" to ${email.to}:`, error);
    return false;
  }
}
