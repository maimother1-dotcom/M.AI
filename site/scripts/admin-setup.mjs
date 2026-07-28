/**
 * Generate admin credentials.
 *
 * Prints environment variables to paste into .env.local or your host's
 * environment settings. Nothing is written to disk and nothing is committed —
 * the password you type never leaves this process, only its scrypt hash does.
 *
 *   npm run admin:setup -- you@example.com
 */

import crypto from "node:crypto";
import readline from "node:readline";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function generateTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

/** Read a line without echoing it to the terminal. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      const s = String(char);
      if (s === "\n" || s === "\r" || s === "") {
        process.stdin.removeListener("data", onData);
      } else {
        // Overwrite whatever the terminal echoed.
        process.stdout.write(`\r\x1b[2K${question}`);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:setup -- you@example.com");
  process.exit(1);
}

const password = await askHidden("Choose an admin password (min 12 characters): ");

if (password.length < 12) {
  console.error("\nToo short. Use at least 12 characters.");
  process.exit(1);
}

const passwordHash = hashPassword(password);
const totpSecret = generateTotpSecret();
const sessionSecret = crypto.randomBytes(48).toString("base64");

const label = encodeURIComponent(`L'INDIENNE:${email}`);
const uri =
  `otpauth://totp/${label}?secret=${totpSecret}&issuer=${encodeURIComponent("L'INDIENNE")}` +
  `&algorithm=SHA1&digits=6&period=30`;

console.log(`
────────────────────────────────────────────────────────────────
Add these to .env.local (local) or your host's environment settings.
Never commit them.
────────────────────────────────────────────────────────────────

ADMIN_EMAIL=${email}
ADMIN_PASSWORD_HASH=${passwordHash}
ADMIN_TOTP_SECRET=${totpSecret}
ADMIN_SESSION_SECRET=${sessionSecret}

────────────────────────────────────────────────────────────────
Now add the account to your authenticator app.

Either scan a QR code generated from this URI, or enter the secret
by hand as a time-based (TOTP) account:

  Secret : ${totpSecret}
  URI    : ${uri}

Verify a code from the app before you close this terminal — if the
secret is lost you will have to run this again and update the
deployment's environment variables.
────────────────────────────────────────────────────────────────
`);
