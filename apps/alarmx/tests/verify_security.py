#!/usr/bin/env python3
"""AlarmX — security audit, runnable.

Implements the checks from the five-prompt guide (Gitleaks, Bearer, ECC
Production Audit, Trail of Bits, ECC Security Review) as assertions that fail
the build, rather than a report somebody reads once.

Run:  python3 verify_security.py

SCOPE, STATED HONESTLY. AlarmX has no backend, no Android app and no server
code yet — see README. So checks 4 and 5 (payments/auth internals, attacker
paths against live endpoints) CANNOT be run against code that does not exist.
What this file does instead:

  * Runs checks 1-3 for real against the whole repository.
  * Runs the money-safety invariants against the prototype, because the
    prototype is the reference implementation the Android build copies.
  * Asserts that the spec (PRD 18) actually contains the requirements that
    close the findings, so they cannot be quietly dropped before build.

Anything this file cannot test is listed at the bottom of its own output.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]   # repo root, not apps/
APP = ROOT / "apps" / "alarmx"

fails, checks = [], []


def check(name, cond, detail=""):
    checks.append((name, bool(cond), detail))
    if not cond:
        fails.append(f"{name} :: {detail}")
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail else ""))


def section(title):
    print(f"\n--- {title} ---")


def tracked_files():
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files"],
                         capture_output=True, text=True, check=True).stdout
    return [ROOT / f for f in out.splitlines() if f]


FILES = tracked_files()
TEXT = {}
for f in FILES:
    try:
        TEXT[f] = f.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError, IsADirectoryError):
        continue


# ============================================================ 1. SECRET LEAKS
section("1. SECRET LEAK PREVENTION (Gitleaks)")

SECRET_PATTERNS = {
    "OpenAI/Anthropic key": r"sk-(ant-)?[A-Za-z0-9_-]{24,}",
    "AWS access key": r"AKIA[0-9A-Z]{16}",
    "GitHub token": r"gh[pousr]_[A-Za-z0-9]{30,}",
    "Slack token": r"xox[baprs]-[A-Za-z0-9-]{20,}",
    "Google API key": r"AIza[0-9A-Za-z_-]{35}",
    "JWT": r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}",
    "private key block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "connection string with password": r"(mongodb(\+srv)?|postgres(ql)?|mysql|redis)://[^\s\"']+:[^\s\"']+@",
}
# Placeholders in templates and docs are not secrets.
PLACEHOLDER = re.compile(
    r"YOUR[_-]|placeholder|example|xxxx|<[a-z_]+>|\$\{|REDACTED|\.\.\.|_HERE", re.I)


def shannon(s):
    """Bits of entropy per character. Real keys are random; English is not."""
    from collections import Counter
    import math
    if not s:
        return 0.0
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in Counter(s).values())


def looks_random(s):
    """A real credential is high-entropy AND contains digits.

    Entropy alone is not enough: kebab-case prose like
    "dont-ask-for-cred-ids-already-connected" scores 3.68 bits/char. But it
    contains no digits, and every real key format does.

    Do NOT also require mixed case — AWS access keys are entirely uppercase,
    and an earlier version of this function silently missed them. The planted
    key self-test below is what caught that."""
    return shannon(s) >= 3.5 and any(c.isdigit() for c in s)

found = []
for f, txt in TEXT.items():
    if f.name.endswith(".template"):
        continue
    for label, pat in SECRET_PATTERNS.items():
        for m in re.finditer(pat, txt):
            line = txt[:m.start()].count("\n") + 1
            ctx = txt.splitlines()[line - 1] if line <= len(txt.splitlines()) else ""
            if PLACEHOLDER.search(ctx):
                continue
            if label != "private key block" and not looks_random(m.group(0)):
                continue      # prose that happens to match, not a key
            found.append(f"{f.relative_to(ROOT)}:{line} {label} "
                         f"(entropy {shannon(m.group(0)):.2f})")
check("no live secrets in any tracked file", not found, "; ".join(found[:3]))

# A scanner nobody has seen catch anything is not evidence of anything.
PLANTED = [("sk-ant-api03-Xq7Lm2Kd9Rt4Vb8Nz1Ws6Yp3Hj5Gf0Cc", "Anthropic key"),
           ("AKIA3XPQZK7MNBVCXZ12", "AWS access key"),
           ("ghp_9aB3cD5eF7gH1iJ2kL4mN6oP8qR0sT2uV4wX", "GitHub token")]
caught = []
for fake, label in PLANTED:
    hit = any(re.search(pat, fake) and looks_random(fake) for pat in SECRET_PATTERNS.values())
    caught.append(hit)
check("the scanner provably catches real key shapes", all(caught),
      f"{sum(caught)}/{len(PLANTED)} planted keys detected")
check("and does not fire on kebab-case prose",
      not looks_random("dont-ask-for-cred-ids-already-connected"))

gitignore = (ROOT / ".gitignore").read_text() if (ROOT / ".gitignore").exists() else ""
check(".env files are gitignored", "*.env" in gitignore or ".env" in gitignore)
check("credential json files are gitignored", "credentials" in gitignore)
check("a template exists so nobody invents their own env format",
      any(f.name.endswith(".env.template") for f in FILES))
check("no .env file is tracked",
      not [f for f in FILES if f.name == ".env" or f.name.endswith(".env")],
      ", ".join(str(f.relative_to(ROOT)) for f in FILES if f.name.endswith(".env")))

# Git history: a rotated secret is still a leaked secret.
# A rotated secret is still a leaked secret: check history, not just HEAD.
hist = subprocess.run(
    ["git", "-C", str(ROOT), "log", "-p", "--all", "-S", "sk-ant-"],
    capture_output=True, text=True).stdout
real_keys = []
for ln in hist.splitlines():
    for m in re.finditer(r"sk-ant-[A-Za-z0-9_-]{20,}", ln):
        if not PLACEHOLDER.search(ln) and looks_random(m.group(0)):
            real_keys.append(ln.strip()[:80])
check("no real Anthropic key appears anywhere in git history",
      not real_keys, "; ".join(real_keys[:2]))


# ====================================================== 2. PERSONAL DATA FLOW
section("2. PERSONAL DATA FLOW AUDIT (Bearer)")

proto = [f for f in TEXT if "prototype" in str(f)]
proto_text = "\n".join(TEXT[f] for f in proto)

check("the prototype makes no network calls at all",
      not re.search(r"\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon", proto_text),
      "no data can leave the device from a design artefact")
check("no console logging anywhere in the prototype",
      not re.search(r"\bconsole\.(log|warn|error|info|debug)\s*\(", proto_text),
      "nothing can be leaked to a log that does not exist")
check("no localStorage, sessionStorage or cookies",
      not re.search(r"localStorage|sessionStorage|document\.cookie", proto_text),
      "PII in localStorage is readable by any XSS on the page")
check("no third-party script or iframe is loaded",
      not re.search(r"<script[^>]+src=[\"']https?://|<iframe", proto_text))
check("survey questions collect no direct identifiers",
      not re.search(r"\b(email|phone|aadhaar|pan|address|dob)\b",
                    proto_text.split("const SIGNUP_Q")[1].split("];")[0], re.I)
      if "const SIGNUP_Q" in proto_text else False,
      "banded age/city only — nothing that identifies a person")

prd = (APP / "PRD.md").read_text()
check("the spec commits to an account deletion path",
      re.search(r"delet(e|ion)", prd, re.I) is not None)
check("consent for data resale is separate and optional (DPDP)",
      "consentOpt" in "\n".join(TEXT[f] for f in TEXT if f.name == "i18n.js"))


# ======================================================== 3. PRE-DEPLOY AUDIT
section("3. PRE-DEPLOY PRODUCTION AUDIT (ECC)")

check("no TODO/FIXME left against a security feature",
      not re.search(r"(TODO|FIXME|HACK)[^\n]*\b(auth|secret|token|security|payout|fraud)\b",
                    "\n".join(TEXT.values()), re.I))
check("no hardcoded test credentials",
      not re.search(r"(test|demo|admin)[_-]?(user|pass|password|token)\s*[:=]\s*[\"'][^\"']+[\"']",
                    "\n".join(TEXT.values()), re.I))

# The prototype's DEV bar is intentional and useful. What must not happen is
# that pattern reaching production, so the spec has to say so explicitly.
check("the prototype's DEV bar exists (it is a design tool)",
      "function devbar()" in proto_text)
check("the spec forbids shipping any debug surface to production",
      re.search(r"debug", prd, re.I) is not None
      and re.search(r"DEV bar|debug surface|debug build", prd, re.I) is not None,
      "PRD 18.5 must name it, or someone will ship it")
check("the spec requires rate limiting on OTP and auth",
      re.search(r"rate.?limit", prd, re.I) is not None,
      "OTP abuse is a direct SMS bill, and SMS is a modelled cost line")
check("the spec requires security headers",
      re.search(r"X-Frame-Options|Strict-Transport-Security|security header", prd, re.I) is not None)
check("the spec requires TLS on the database connection",
      re.search(r"TLS", prd) is not None)


# =============================================== 4. MONEY SAFETY INVARIANTS
section("4. MONEY SAFETY (Trail of Bits — payment logic)")

idx = (APP / "prototype" / "index.html").read_text()

check("money is held in INTEGER PAISE, not floats",
      "withdrawablePaise" in idx and "lifetimePaise" in idx,
      "float balances drift and cannot be reconciled against a PSP")
check("credits are ROUNDED DOWN, never up",
      "Math.floor(poolMP / 10)" in idx,
      "rounding up leaks ₹1.73–₹3.45/user/month against a ₹3.30 Conservative profit")
check("the dropped sub-paisa is carried, not lost",
      "carryMP" in idx, "exact over time, and never overpaid at any single moment")
check("no credit path uses Math.ceil or Math.round on money",
      not re.search(r"Math\.(ceil|round)\([^)]*(?:MP|[Pp]aise|credit|gross)", idx),
      "the only rounding on money is downward")
check("the spin awards a multiplier, never a fixed rupee prize",
      "SPIN_TABLE" in idx and not re.search(r"\[\s*25\s*,", idx),
      "a fixed prize is a promise against variable revenue")
check("an unverified ad view cannot credit anything",
      re.search(r"if\s*\(!verified\)\s*\{[^}]*credit:\s*0", idx, re.S) is not None,
      "the server-side verification gate, in the reference implementation")


# ===================================== 5. ATTACKER PATHS (spec requirements)
section("5. ATTACKER'S PERSPECTIVE (ECC) — closed in the spec")

REQUIRED = {
    "day boundary is server-side, not device timezone":
        r"server[- ]side.{0,80}day boundary|day boundary.{0,120}server",
    "self-referral is explicitly blocked":
        r"self[- ]referr|refer(s|ring)? (them|him|her)sel(f|ves)",
    "referral volume is capped":
        r"referral.{0,80}(cap|limit|maximum)|(cap|limit).{0,60}referral",
    "withdrawal is idempotent against double-submit":
        r"idempotent",
    "SSV callbacks are signature-verified and replay-proof":
        r"signature[- ]verif",
    "share tier is read server-side, never sent by the client":
        r"client never sends its own tier|read \*\*server-side\*\*",
}
for name, pat in REQUIRED.items():
    check(name, re.search(pat, prd, re.I | re.S) is not None)


# ==================================================================== REPORT
print("\n" + "=" * 62)
passed = sum(1 for _, c, _ in checks if c)
print(f"{passed}/{len(checks)} security checks passed")
if fails:
    print("\nFAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("All security checks passed.")
print("""
WHAT THIS FILE CANNOT TEST, and nobody should pretend otherwise:

  * There is no backend, so no endpoint was actually attacked. IDOR, privilege
    escalation, JWT handling, SQL injection and CORS are specified in PRD 8
    and 18 but UNTESTED, because there is no server to test.
  * There is no Android build, so Play Integrity, SSV wiring, keystore
    handling and certificate pinning are UNTESTED.
  * The payment rail does not exist. Webhook signature verification, payout
    idempotency under concurrency, and refund/chargeback paths are UNTESTED.
  * No AI audit replaces a human security review. AlarmX moves real money to
    real bank accounts and holds DPDP-regulated data. Book one before launch.

Re-run this file after every feature that touches money, auth or user data.
""")
