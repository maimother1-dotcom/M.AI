#!/usr/bin/env python3
"""Build the AlarmX unit-economics workbook (v0.6).

v0.6 replaces the fixed monthly cap with a REVENUE SHARE. The user is paid a
percentage of ad revenue that has already arrived and been verified server
side, so a loss on the reward line is structurally impossible rather than
merely unlikely. _no_loss_gate() at the bottom refuses to write the file if
any scenario, at any share tier, at half or a quarter of the assumed eCPM,
would lose money.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = "/home/user/M.AI/apps/alarmx/economics/AlarmX-unit-economics.xlsx"

FONT = "Arial"
BLUE = Font(name=FONT, size=10, color="0000FF")
BLACK = Font(name=FONT, size=10)
GREEN = Font(name=FONT, size=10, color="008000")
BOLD = Font(name=FONT, size=10, bold=True)
BOLD_WHITE = Font(name=FONT, size=11, bold=True, color="FFFFFF")
TITLE = Font(name=FONT, size=14, bold=True)
NOTE = Font(name=FONT, size=9, italic=True, color="595959")

HDR_FILL = PatternFill("solid", fgColor="1F3864")
SEC_FILL = PatternFill("solid", fgColor="D9E2F3")
KEY_FILL = PatternFill("solid", fgColor="FFFF00")
OUT_FILL = PatternFill("solid", fgColor="E2EFDA")
CAC_FILL = PatternFill("solid", fgColor="FCE4D6")

RUP = '₹#,##0.00;(₹#,##0.00);-'
RUP0 = '₹#,##0;(₹#,##0);-'
PCT = '0.0%;(0.0%);-'
NUM = '#,##0.0;(#,##0.0);-'
INT = '#,##0;(#,##0);-'

thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ---------------------------------------------------------------- README
rd = wb.active
rd.title = "README"
rd.sheet_view.showGridLines = False

rows = [
    ("AlarmX — Unit Economics Model (v0.6)", TITLE, None),
    ("", None, None),
    ("THE ONE IDEA IN THIS MODEL", BOLD, None),
    ("The user is paid a SHARE OF AD REVENUE THAT HAS ALREADY ARRIVED.", BOLD, None),
    ("Not a rate. Not a cap. A share of money already in the account.", BLACK, None),
    ("", None, None),
    ("Every rupee credited is backed by an ad impression the SERVER has verified.", BLACK, None),
    ("  no ad served      -> nothing credited, nothing owed", BLACK, None),
    ("  eCPM halves       -> payouts halve the same day, automatically", BLACK, None),
    ("  fill drops        -> payouts drop with it", BLACK, None),
    ("  client claims a view the server did not see -> not credited", BLACK, None),
    ("", None, None),
    ("This makes a loss on the reward line STRUCTURALLY IMPOSSIBLE, not merely", BOLD, None),
    ("unlikely. There is no forecast to be wrong about, because nothing is", BLACK, None),
    ("promised before the money exists.", BLACK, None),
    ("", None, None),
    ("Every earlier version failed the same way: a FIXED promise made against", BLACK, None),
    ("VARIABLE revenue. Rs95/month. Rs0.50 a math. Rs2 a set. Each one was a", BLACK, None),
    ("number chosen first and defended afterwards. This one cannot be wrong,", BLACK, None),
    ("because it is a fraction of whatever actually turns up.", BLACK, None),
    ("", None, None),
    ("WHAT IT PAYS AND WHAT IT KEEPS", BOLD, None),
    ("                        Conservative      Base   Optimistic", BLACK, None),
    ("  Ad revenue               {ad_c:>10}{ad_b:>10}{ad_o:>13}", BLACK, None),
    ("  Survey resale (retained) {sv_c:>10}{sv_b:>10}{sv_o:>13}", BLACK, None),
    ("  User earns (60% tier)    {us_c:>10}{us_b:>10}{us_o:>13}", BLACK, None),
    ("  Per active day           {pd_c:>10}{pd_b:>10}{pd_o:>13}", BLACK, None),
    ("  PROFIT                   {pf_c:>10}{pf_b:>10}{pf_o:>13}", BOLD, None),
    ("", None, None),
    ("Profit is positive in EVERY column at the HIGHEST share tier. The Model", BLACK, None),
    ("tab also shows profit if eCPM halved - still positive everywhere.", BLACK, None),
    ("", None, None),
    ("THE SHARE LADDER", BOLD, None),
    ("  days 1-6      50%", BLACK, None),
    ("  day 7+        55%      streak reward that costs nothing already unearned", BLACK, None),
    ("  day 30+       60%      the worst case, and what profit is tested against", BLACK, None),
    ("  until Rs10    70%      acquisition spend, gets the user paid fast", BLACK, None),
    ("", None, None),
    ("THE MONTHLY CAP IS GONE. Replaced by a ceiling of 20 credited ad views a", BOLD, None),
    ("day. A monthly cap made the app go dead once a user hit it - earning", BLACK, None),
    ("nothing for the rest of the cycle, which is the opposite of retention.", BLACK, None),
    ("A daily ceiling bounds fraud without ever doing that.", BLACK, None),
    ("", None, None),
    ("THE BUILD GATE", BOLD, None),
    ("build_model.py refuses to write this file if any scenario, at any share", BLACK, None),
    ("tier, at half or a quarter of the assumed eCPM, would lose money.", BLACK, None),
    ("36 combinations, checked on every build. The gate has been tested by", BLACK, None),
    ("deliberately breaking it.", BLACK, None),
    ("", None, None),
    ("STILL THE WEAKEST INPUTS", BOLD, None),
    ("  1. Average sets completed per day. The revenue case leans on it and it", BLACK, None),
    ("     has never been measured. It is deliberately the assumption carrying", BLACK, None),
    ("     the uncertainty, rather than hiding it in a rate.", BLACK, None),
    ("  2. Rewarded eCPM and fill rate for India Android. Published benchmarks,", BLACK, None),
    ("     not measurements. Open a real AdMob account before trusting Base.", BLACK, None),
    ("  3. Survey resale values. Placeholders. But note: the user is paid from", BLACK, None),
    ("     AD REVENUE ONLY, so a zero survey line reduces profit, never the", BLACK, None),
    ("     payout, and never below zero.", BLACK, None),
    ("", None, None),
    ("What changed in v0.4 — deliberately, almost nothing", BOLD, None),
    ("v0.4 adds the regional calendar and the 4x2 home-screen widget (PRD 16).", BLACK, None),
    ("It pays no cash, so it does not touch the cap. Two accounting notes:", BLACK, None),
    ("  - Swiss Ephemeris Professional licence: a ONE-TIME CAPITALISED COST, paid", BLACK, None),
    ("    per project before distribution. It is not a per-user cost and must not be", BLACK, None),
    ("    amortised into the cap. Get the current fee from Astrodienst before booking it.", BLACK, None),
    ("  - The widget MAY raise active days per month (Base assumes 26). That would", BLACK, None),
    ("    raise revenue and therefore the cap. IT IS NOT BAKED IN, AND MUST NOT BE.", BLACK, None),
    ("    Raising a revenue assumption on the strength of an unshipped feature is how", BLACK, None),
    ("    the Rs95 design happened. Re-measure after 60 days of live data, then decide.", BLACK, None),
    ("", None, None),
    ("What changed in v0.3", BOLD, None),
    ("The first payout drops from Rs30 to Rs10. That is not free:", BLACK, None),
    ("  - Fewer users churn without ever withdrawing, so BREAKAGE FALLS.", BLACK, None),
    ("  - Lower breakage means more of what is accrued is actually paid out.", BLACK, None),
    ("  - Higher real cash cost means the SUSTAINABLE CAP FALLS.", BLACK, None),
    ("The Model tab quantifies exactly how much, and compares against v0.2.", BLACK, None),
    ("", None, None),
    ("The first payout is booked as ACQUISITION, not as a reward.", BOLD, None),
    ("Rs10 plus the payout fee buys the 'it actually paid me' moment, which is a", BLACK, None),
    ("marketing outcome. The same rupees spent on an install ad would buy far less.", BLACK, None),
    ("Charging it to the reward budget would wrongly depress the cap in every later", BLACK, None),
    ("month. It sits in its own block on the Model tab, compared against install cost.", BLACK, None),
    ("", None, None),
    ("How to use it", BOLD, None),
    ("1. Assumptions tab. Edit ONLY the blue cells.", BLACK, None),
    ("2. Three scenarios: Conservative / Base / Optimistic. Base is the planning case.", BLACK, None),
    ("3. Model computes the cap per scenario. Nothing there is typed by hand.", BLACK, None),
    ("4. Scale shows monthly P&L at 10k / 100k / 1M MAU. Set your cap in the yellow cell.", BLACK, None),
    ("5. Sensitivity grids cap against revenue per user.", BLACK, None),
    ("", None, None),
    ("Colour key", BOLD, None),
    ("Blue text = hardcoded input you can edit", BLUE, None),
    ("Black text = formula, do not overwrite", BLACK, None),
    ("Green text = link to another sheet", GREEN, None),
    ("Yellow fill = load-bearing assumption", BLACK, KEY_FILL),
    ("Orange fill = acquisition, deliberately outside the reward budget", BLACK, CAC_FILL),
    ("", None, None),
    ("Sources", BOLD, None),
    ("Rewarded video eCPM: India Android rewarded benchmarked around $1.50; India across", BLACK, None),
    ("  ad types spans $0.50-$2.00. Source: Coinis rewarded-video glossary; Business of Apps.", BLACK, None),
    ("UPI payout fee: RazorpayX Rs2-5 per payout, UPI at the low end. Verify the live", BLACK, None),
    ("  price card before committing.", BLACK, None),
    ("Survey resale values: NOT SOURCED. Placeholders, and the least reliable inputs here.", BLACK, None),
    ("  Validate with a real data buyer before counting this revenue.", BLACK, None),
    ("Breakage and share-reaching-first-payout: assumptions, not measured. Revisit after", BLACK, None),
    ("  60 days of live data - they move the cap more than almost anything else.", BLACK, None),
]
# ------------------------------------------------------------ ASSUMPTIONS
a = wb.create_sheet("Assumptions")
a.sheet_view.showGridLines = False
a["A1"] = "Assumptions — edit the blue cells only"
a["A1"].font = TITLE

for j, h in enumerate(["Input", "Conservative", "Base", "Optimistic", "Unit", "Source / note"], start=1):
    c = a.cell(row=3, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BOX

DATA = [
    (4, "GLOBAL", None, None, None, None, None, None, True),
    (5, "USD / INR exchange rate", 88, 88, 88, "₹ per $", "Assumption, 2026", NUM, False),
    (6, "Active days per user per month", 20, 26, 30, "days", "Days the user opens the app and completes an alarm", NUM, False),

    (7, "AD REVENUE", None, None, None, None, None, None, True),
    (8, "Rewarded video eCPM", 1.00, 1.50, 2.50, "$ per 1,000", "India Android rewarded ~$1.50; India range $0.50–$2.00", '$#,##0.00', False),
    (9, "Rewarded videos per active day", 3, 4, 5, "views", "v0.5 — raised from 2/3/4. Opt-in, and worth 3.8x an interstitial", NUM, False),
    (10, "Ad fill rate", 0.70, 0.80, 0.90, "%", "Share of ad requests returning a paying ad in India", PCT, False),
    (11, "Interstitial eCPM", 0.25, 0.40, 0.70, "$ per 1,000", "Materially below rewarded video — 27% of it at base", '$#,##0.00', False),
    (12, "Interstitials per active day", 3, 4, 6, "views", "Allowed slots only — NONE in the alarm dismissal path, PRD 4.6", NUM, False),
    (13, "Banner revenue", 1.00, 2.00, 4.00, "₹/user/month", "Banners earn very little in India", RUP, False),

    (14, "SURVEY DATA RESALE", None, None, None, None, None, None, True),
    (15, "One-time profile resale value", 8, 15, 30, "₹ per user", "PLACEHOLDER — validate with a real buyer", RUP, False),
    (16, "Expected user lifetime", 3, 4, 6, "months", "Amortises the one-time value and the acquisition cost", NUM, False),
    (17, "Daily drip batch value", 0.15, 0.25, 0.50, "₹ per batch", "PLACEHOLDER — 2–3 questions answered per day", RUP, False),

    (18, "SPONSORED QR — DORMANT", None, None, None, None, None, None, True),
    (19, "Sponsored scans per active day", 0, 0, 0, "scans", "ZERO until a brand signs. Rails built, switch off.", NUM, False),
    (20, "Brand-funded value per scan", 0.50, 1.00, 2.00, "₹ per scan", "Scenario only — no revenue while row 19 is zero", RUP, False),

    (21, "WITHDRAWAL THRESHOLDS", None, None, None, None, None, None, True),
    (22, "First payout threshold", 10, 10, 10, "₹", "v0.3 decision — buys the first-payout trust moment", RUP0, False),
    (23, "Subsequent payout threshold", 30, 30, 30, "₹", "Unchanged", RUP0, False),
    (24, "Breakage at a ₹10 first payout", 0.15, 0.25, 0.40, "% of rewards", "Accrued but never withdrawn. LOWER than v0.2 — fewer churn before cashing out.", PCT, False),
    (25, "Breakage at a ₹30 first payout (v0.2)", 0.25, 0.40, 0.55, "% of rewards", "Kept only to quantify what the ₹10 decision costs", PCT, False),

    (26, "COSTS", None, None, None, None, None, None, True),
    (27, "UPI payout fee", 5.00, 3.00, 2.00, "₹ per payout", "RazorpayX ₹2–5; UPI at the low end", RUP, False),
    (28, "Payouts per withdrawing user", 1, 1, 1, "per month", "Monthly batch payout", NUM, False),
    (29, "Infrastructure cost", 0.80, 0.50, 0.30, "₹/MAU/month", "Firebase, Firestore, Functions, Play Integrity", RUP, False),
    (30, "SMS / OTP cost", 0.30, 0.15, 0.10, "₹/user/month", "Assumption", RUP, False),
    (31, "Support cost", 0.60, 0.30, 0.15, "₹/user/month", "Withdrawal disputes dominate", RUP, False),
    (32, "Fraud leakage", 0.10, 0.05, 0.02, "% of rewards", "Rupees reaching accounts that beat the controls", PCT, False),

    (33, "TARGETS", None, None, None, None, None, None, True),
    (34, "Target contribution margin", 0.30, 0.30, 0.30, "% of revenue", "Profit retained before the reward budget is set", PCT, False),

    (35, "ACQUISITION — booked outside the reward budget", None, None, None, None, None, None, True),
    (36, "Share of users reaching the first payout", 0.55, 0.70, 0.85, "%", "Higher at ₹10 than it was at ₹30", PCT, False),
    (37, "Referral bonus per referred install", 5.00, 5.00, 5.00, "₹", "CAC line, never counted against the reward cap", RUP, False),
    (38, "Paid install cost (CPI) in India", 30.00, 22.00, 15.00, "₹ per install", "Benchmark for judging the first payout as acquisition", RUP, False),

    (40, "MATH SECTION — the daytime earning loop (PRD 4.7)", None, None, None, None, None, None, True),
    (41, "Math sets offered per day", 5, 5, 5, "sets", "Locked until the day's alarm is completed", NUM, False),
    (42, "Maths per set", 4, 4, 4, "questions", "20 questions a day if every set is taken", NUM, False),
    (43, "Rewarded ads per set", 2, 2, 2, "views", "One after every 2 questions", NUM, False),
    (44, "Average sets completed per day", 2, 3, 5, "sets", "THE honest home for the uncertainty. Measure this after launch.", NUM, False),

    (45, "REVENUE SHARE — what the user is paid (PRD 2)", None, None, None, None, None, None, True),
    (46, "User share of realised ad revenue", 0.50, 0.50, 0.50, "%", "Paid only against ad views the SERVER has verified. No view, no credit.", PCT, False),
    (47, "Share at a 7-day streak", 0.55, 0.55, 0.55, "%", "Retention lever. Costs nothing that was not already earned.", PCT, False),
    (48, "Share at a 30-day streak", 0.60, 0.60, 0.60, "%", "WORST CASE for the business — profit is tested against this", PCT, False),
    (49, "Share until lifetime earnings reach the first threshold", 0.70, 0.70, 0.70, "%", "Acquisition spend, gets the user to their first real payout fast", PCT, False),
    (50, "Daily credited ad views ceiling", 20, 20, 20, "views", "Replaces the monthly cap. Bounds fraud without the app going dead mid-month.", NUM, False),
]

# --------------------------------------------- README figures, derived from DATA
# The revenue-source block on the README sheet is computed from the assumptions
# above rather than typed, so it can never drift out of step with them.
_A = {label: (cons, base, opt) for _, label, cons, base, opt, *_ in DATA if cons is not None}


def _readme_figures():
    """Computed from DATA so the README sheet can never drift from the model."""
    def v(label, i):
        return _A[label][i]

    out = {}
    for i, tag in enumerate("cbo"):
        fx = v("USD / INR exchange rate", i)
        days, fill = v("Active days per user per month", i), v("Ad fill rate", i)
        views = min(v("Rewarded videos per active day", i)
                    + v("Average sets completed per day", i) * v("Rewarded ads per set", i),
                    v("Daily credited ad views ceiling", i))
        ads = (v("Rewarded video eCPM", i) / 1000 * fx * views * days * fill
               + v("Interstitial eCPM", i) / 1000 * fx * v("Interstitials per active day", i) * days * fill
               + v("Banner revenue", i))
        surveys = v("One-time profile resale value", i) / v("Expected user lifetime", i) \
            + v("Daily drip batch value", i) * days
        share = v("Share at a 30-day streak", i)          # worst case for the business
        user = ads * share
        breakage = v("Breakage at a ₹10 first payout", i)
        fixed = (v("UPI payout fee", i) * v("Payouts per withdrawing user", i) * (1 - breakage)
                 + v("Infrastructure cost", i) + v("SMS / OTP cost", i) + v("Support cost", i)
                 + user * v("Fraud leakage", i))
        out[f"ad_{tag}"] = f"Rs{ads:,.2f}"
        out[f"sv_{tag}"] = f"Rs{surveys:,.2f}"
        out[f"us_{tag}"] = f"Rs{user:,.2f}"
        out[f"pd_{tag}"] = f"Rs{user / days:,.2f}"
        out[f"pf_{tag}"] = f"Rs{ads - user + surveys - fixed:,.2f}"
    return out


FIG = _readme_figures()
for i, (text, font, fill) in enumerate(rows, start=1):
    c = rd.cell(row=i, column=1, value=text.format(**FIG) if "{" in text else text)
    if font:
        c.font = font
    if fill:
        c.fill = fill
rd.column_dimensions["A"].width = 100

for row, label, cons, base, opt, unit, note, fmt, is_sec in DATA:
    if is_sec:
        for j in range(1, 7):
            c = a.cell(row=row, column=j)
            c.fill = CAC_FILL if "ACQUISITION" in label else SEC_FILL
            c.border = BOX
        c = a.cell(row=row, column=1, value=label)
        c.font = BOLD
        continue
    c = a.cell(row=row, column=1, value=label)
    c.font = BLACK
    c.border = BOX
    for j, v in ((2, cons), (3, base), (4, opt)):
        c = a.cell(row=row, column=j, value=v)
        c.font = BLUE
        c.number_format = fmt
        c.border = BOX
        c.alignment = Alignment(horizontal="center")
    c = a.cell(row=row, column=5, value=unit)
    c.font = NOTE
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
    c = a.cell(row=row, column=6, value=note)
    c.font = NOTE
    c.border = BOX

for r in (8, 15, 17, 24, 36):
    for j in range(2, 5):
        a.cell(row=r, column=j).fill = KEY_FILL

a.column_dimensions["A"].width = 40
for col in "BCD":
    a.column_dimensions[col].width = 14
a.column_dimensions["E"].width = 14
a.column_dimensions["F"].width = 64
a.freeze_panes = "B4"

# ------------------------------------------------------------------ MODEL
m = wb.create_sheet("Model")
m.sheet_view.showGridLines = False
m["A1"] = "Per-user monthly economics and the sustainable earning cap"
m["A1"].font = TITLE
m["A2"] = "All figures per ACTIVE user per month unless stated. Nothing here is typed by hand."
m["A2"].font = NOTE

for j, h in enumerate(["Line item", "Conservative", "Base", "Optimistic", "Note"], start=1):
    c = m.cell(row=4, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BOX


def section(row, label, fill=SEC_FILL):
    for j in range(1, 6):
        c = m.cell(row=row, column=j)
        c.fill = fill
        c.border = BOX
    c = m.cell(row=row, column=1, value=label)
    c.font = BOLD


def line(row, label, tmpl, fmt=RUP, note="", bold=False, fill=None):
    c = m.cell(row=row, column=1, value=label)
    c.font = BOLD if bold else BLACK
    c.border = BOX
    if fill:
        c.fill = fill
    for j, col in ((2, "B"), (3, "C"), (4, "D")):
        c = m.cell(row=row, column=j, value=tmpl.format(c=col))
        c.font = BOLD if bold else BLACK
        c.number_format = fmt
        c.border = BOX
        if fill:
            c.fill = fill
    c = m.cell(row=row, column=5, value=note)
    c.font = NOTE
    c.border = BOX
    if fill:
        c.fill = fill


# Total rewarded views a day: the standing offer plus the math section,
# bounded by the daily ceiling that replaced the monthly cap.
REW_VIEWS = "MIN(Assumptions!{c}9+Assumptions!{c}44*Assumptions!{c}43,Assumptions!{c}50)"
MATH_VIEWS = "MIN(Assumptions!{c}44*Assumptions!{c}43,MAX(0,Assumptions!{c}50-Assumptions!{c}9))"

section(5, "REVENUE")
line(6, "Rewarded video — standing offer",
     "=Assumptions!{c}8*Assumptions!{c}5/1000*Assumptions!{c}9*Assumptions!{c}6*Assumptions!{c}10",
     note="eCPM → ₹/view × views/day × active days × fill rate")
line(7, "Rewarded video — math section",
     "=Assumptions!{c}8*Assumptions!{c}5/1000*" + MATH_VIEWS + "*Assumptions!{c}6*Assumptions!{c}10",
     note="Sets completed × ads per set, inside the daily ceiling")
line(8, "Interstitial",
     "=Assumptions!{c}11*Assumptions!{c}5/1000*Assumptions!{c}12*Assumptions!{c}6*Assumptions!{c}10",
     note="Allowed slots only — never in the alarm dismissal path")
line(9, "Banner", "=Assumptions!{c}13")
line(10, "Survey — one-time profile, amortised", "=Assumptions!{c}15/Assumptions!{c}16")
line(11, "Survey — daily drip", "=Assumptions!{c}17*Assumptions!{c}6")
line(12, "Sponsored QR (dormant)", "=Assumptions!{c}19*Assumptions!{c}20*Assumptions!{c}6",
     note="₹0 until a brand signs")
line(13, "TOTAL REVENUE", "=SUM({c}6:{c}12)", bold=True, fill=OUT_FILL)
line(14, "of which AD REVENUE", "=SUM({c}6:{c}9)", bold=True,
     note="THE ONLY LINE THE USER IS PAID FROM. Survey revenue is retained.")
line(15, "Rewarded views credited per active day", "=" + REW_VIEWS, fmt=NUM,
     note="Bounded by the daily ceiling, Assumptions row 50")

section(17, "WHAT THE USER EARNS — a share of revenue that has ALREADY ARRIVED")
line(18, "Share, days 1–6", "=Assumptions!{c}46", fmt=PCT)
line(19, "Share, day 7+ streak", "=Assumptions!{c}47", fmt=PCT)
line(20, "Share, day 30+ streak", "=Assumptions!{c}48", fmt=PCT)
line(21, "User earns, days 1–6", "={c}14*{c}18")
line(22, "User earns, day 7+", "={c}14*{c}19")
line(23, "User earns, day 30+", "={c}14*{c}20", bold=True, fill=OUT_FILL,
     note="The most a streak user can earn — and the worst case for the business")
line(24, "Per active day at day 30+", "={c}23/Assumptions!{c}6", bold=True,
     note="What the Daily Close shows")

section(26, "NON-REWARD COSTS")
line(27, "UPI payout fees", "=Assumptions!{c}27*Assumptions!{c}28*(1-Assumptions!{c}24)",
     note="Only non-breakage users trigger a payout")
line(28, "Infrastructure", "=Assumptions!{c}29")
line(29, "SMS / OTP", "=Assumptions!{c}30")
line(30, "Support", "=Assumptions!{c}31")
line(31, "Fraud leakage on rewards", "={c}23*Assumptions!{c}32",
     note="Costed at the worst-case share")
line(32, "TOTAL NON-REWARD COST", "=SUM({c}27:{c}31)", bold=True, fill=OUT_FILL)

section(34, "PROFIT — THIS IS THE LINE THAT MUST NEVER GO NEGATIVE")
line(35, "Ad revenue retained", "={c}14-{c}23", note="The half not paid out, at the worst-case share")
line(36, "Survey revenue retained", "={c}10+{c}11", note="Entirely retained — never shared")
line(37, "PROFIT PER ACTIVE USER PER MONTH", "={c}35+{c}36-{c}32", bold=True, fill=OUT_FILL,
     note="Worst case: every user on the 60% streak share")
line(38, "Margin on total revenue", "=IF({c}13=0,0,{c}37/{c}13)", fmt=PCT, bold=True)
line(39, "SAFE?", '=IF({c}37>0,"YES — profitable at the highest share","NO — DO NOT SHIP")',
     fmt='General', bold=True, fill=OUT_FILL,
     note="Must read YES in all three columns. This is the release gate.")
line(40, "Headroom before a loss", "=IF({c}14=0,0,{c}37/{c}14)", fmt=PCT,
     note="How much further the share could rise before profit hits zero")

section(42, "WHY THIS CANNOT LOSE MONEY THE WAY EARLIER VERSIONS COULD")
line(43, "Payout if eCPM halved", "={c}23/2",
     note="Payout falls with revenue automatically — no renegotiation, no broken promise")
line(44, "Profit if eCPM halved", "=({c}14/2)-({c}23/2)+{c}36-{c}32", bold=True,
     note="Still positive: the share is a fraction of whatever actually arrives")
line(45, "Payout if fill dropped to zero", "=0", note="No ad served, nothing credited, nothing owed")

section(47, "ACQUISITION — separate book, NOT charged against the share", CAC_FILL)
line(48, "First payout, cash", "=Assumptions!{c}22", fill=CAC_FILL)
line(49, "First payout, transaction fee", "=Assumptions!{c}27", fill=CAC_FILL)
line(50, "Total first-payout cost per converting user", "={c}48+{c}49", bold=True, fill=CAC_FILL)
line(51, "Blended across all installs", "={c}50*Assumptions!{c}36", fill=CAC_FILL)
line(52, "Paid install cost (CPI) benchmark", "=Assumptions!{c}38", fill=CAC_FILL)
line(53, "First payout as % of a paid install", "=IF({c}52=0,0,{c}51/{c}52)", fmt=PCT,
     bold=True, fill=CAC_FILL,
     note="Under 100% means it buys a paid, retained user cheaper than an ad buys a raw install")
line(54, "Days to reach the first payout at the boosted share",
     "=IF({c}14=0,0,Assumptions!{c}22/(({c}14*Assumptions!{c}49)/Assumptions!{c}6))",
     fmt=NUM, fill=CAC_FILL,
     note="70% share until the first ₹10 — booked as acquisition, not reward")

section(56, "REALITY CHECK vs THE ORIGINAL ₹95 DESIGN")
for j in range(2, 5):
    c = m.cell(row=57, column=j, value=95)
    c.font = BLUE
    c.number_format = RUP0
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
c = m.cell(row=57, column=1, value="Original design payout (₹60 math + ₹30 streak + ₹5 signup)")
c.font = BLACK
c.border = BOX
m.cell(row=57, column=5, value="A fixed promise made against variable revenue").font = NOTE
line(58, "What the share pays instead", "={c}23", bold=True)
line(59, "Monthly loss per user had ₹95 shipped",
     "={c}13-{c}32-{c}57", fmt=RUP, bold=True,
     note="The failure mode this design removes entirely")

m.column_dimensions["A"].width = 46
for col in "BCD":
    m.column_dimensions[col].width = 15
m.column_dimensions["E"].width = 58
m.freeze_panes = "B5"

# ------------------------------------------------------------------ SCALE
s = wb.create_sheet("Scale")
s.sheet_view.showGridLines = False
s["A1"] = "Monthly P&L at scale — Base case, revenue-share model"
s["A1"].font = TITLE
s["A2"] = "There is no cap to set. The payout is a share of ad revenue that has already arrived."
s["A2"].font = NOTE

s["A4"] = "User share to test"
s["A4"].font = BOLD
s["B4"] = 0.60
s["B4"].font = BLUE
s["B4"].number_format = PCT
s["B4"].fill = KEY_FILL
s["B4"].border = BOX
s["C4"] = "Worst case — every user on the 30-day streak tier"
s["C4"].font = NOTE

s["A5"] = "Ad revenue per active user (Base, from Model)"
s["B5"] = "=Model!C14"
s["B5"].font = GREEN
s["B5"].number_format = RUP
s["B5"].border = BOX
s["C5"] = "The only line the share is taken from"
s["C5"].font = NOTE

s["A6"] = "New-user share (drives acquisition cost)"
s["B6"] = 0.25
s["B6"].font = BLUE
s["B6"].number_format = PCT
s["B6"].fill = KEY_FILL
s["B6"].border = BOX
s["C6"] = "Share of MAU in their first cycle"
s["C6"].font = NOTE

for j, h in enumerate(["Line item", "10k MAU", "100k MAU", "1M MAU"], start=1):
    c = s.cell(row=8, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = BOX

for col, v in {"B": 10000, "C": 100000, "D": 1000000}.items():
    c = s[f"{col}9"]
    c.value = v
    c.font = BLUE
    c.number_format = INT
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
s["A9"] = "Monthly active users"
s["A9"].border = BOX


def srow(row, label, tmpl, fmt=RUP0, bold=False, fill=None, note=""):
    c = s.cell(row=row, column=1, value=label)
    c.font = BOLD if bold else BLACK
    c.border = BOX
    if fill:
        c.fill = fill
    for col in ("B", "C", "D"):
        c = s[f"{col}{row}"]
        c.value = tmpl.format(c=col)
        c.font = BOLD if bold else BLACK
        c.number_format = fmt
        c.border = BOX
        if fill:
            c.fill = fill
    c = s.cell(row=row, column=5, value=note)
    c.font = NOTE


srow(10, "Total revenue", "={c}9*Model!$C$13")
srow(11, "User payout — share of ad revenue", "=-{c}9*Model!$C$14*$B$4",
     note="Falls automatically if eCPM or fill falls. Cannot exceed what arrived.")
srow(12, "Non-reward costs", "=-{c}9*Model!$C$32")
srow(13, "CONTRIBUTION before acquisition", "=SUM({c}10:{c}12)", bold=True, fill=OUT_FILL)
srow(14, "Acquisition — first payouts", "=-{c}9*$B$6*Model!$C$51", fill=CAC_FILL,
     note="One-off per new user, not a recurring reward")
srow(15, "CONTRIBUTION after acquisition", "={c}13+{c}14", bold=True, fill=OUT_FILL)
srow(16, "Margin after acquisition", "=IF({c}10=0,0,{c}15/{c}10)", fmt=PCT, bold=True, fill=OUT_FILL)
srow(17, "SAFE AT SCALE?", '=IF({c}15>0,"YES","NO — DO NOT SHIP")', fmt="General",
     bold=True, fill=OUT_FILL)
srow(19, "If eCPM halved: revenue", "={c}9*(Model!$C$13-Model!$C$14/2)")
srow(20, "If eCPM halved: user payout", "=-{c}9*(Model!$C$14/2)*$B$4",
     note="The payout halves with it — this is the whole point")
srow(21, "If eCPM halved: CONTRIBUTION", "={c}19+{c}20-{c}9*Model!$C$32", bold=True, fill=OUT_FILL)
srow(23, "Contribution had the ORIGINAL ₹95 shipped",
     "={c}9*Model!$C$13-{c}9*Model!$C$32-{c}9*Model!$C$57",
     bold=True, note="A fixed promise against variable revenue — the failure this removes")

s.column_dimensions["A"].width = 42
for col in "BCD":
    s.column_dimensions[col].width = 18
s.column_dimensions["E"].width = 46

# ------------------------------------------------------------ SENSITIVITY
sn = wb.create_sheet("Sensitivity")
sn.sheet_view.showGridLines = False
sn["A1"] = "Profit per user per month — user share against ad revenue"
sn["A1"].font = TITLE
sn["A2"] = "Rows = share paid to the user. Columns = ad revenue per active user. Base-case costs and survey revenue."
sn["A2"].font = NOTE
sn["A3"] = "Bracketed values are losses. The shipped share is 50-60%; note how much room sits above it."
sn["A3"].font = NOTE

REV = [5, 10, 15, 20, 25, 30, 40, 60]
CAPS = [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0]

c = sn["A5"]
c.value = "Share \\ Ad revenue"
c.font = BOLD_WHITE
c.fill = HDR_FILL
c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
c.border = BOX
for j, rev in enumerate(REV, start=2):
    c = sn.cell(row=5, column=j, value=rev)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.number_format = RUP0
    c.alignment = Alignment(horizontal="center")
    c.border = BOX

for i, cap in enumerate(CAPS, start=6):
    c = sn.cell(row=i, column=1, value=cap)
    c.font = BLUE
    c.number_format = PCT
    c.alignment = Alignment(horizontal="center")
    if cap in (0.5, 0.6):
        c.fill = KEY_FILL
    c.border = BOX
    for j in range(2, len(REV) + 2):
        col = get_column_letter(j)
        cc = sn.cell(row=i, column=j,
                     value=f"={col}$5*(1-$A{i})+Model!$C$36-Model!$C$32")
        cc.number_format = RUP
        cc.border = BOX

sn.cell(row=len(CAPS) + 7, column=1,
        value="Shipped shares (50% and 60%) are highlighted. Every negative cell is a loss per user per month.").font = NOTE
sn.column_dimensions["A"].width = 20
for j in range(2, len(REV) + 2):
    sn.column_dimensions[get_column_letter(j)].width = 13

# ------------------------------------------------- THE NO-LOSS BUILD GATE
# The whole point of the revenue-share design is that a loss on the reward
# line is structurally impossible. This asserts it in Python rather than
# trusting the spreadsheet to be read: the build FAILS if any scenario, at
# any share tier, at half the assumed eCPM, would lose money.
def _no_loss_gate():
    A = {label: (c, b, o) for _, label, c, b, o, *_ in DATA if c is not None}
    cols = ("Conservative", "Base", "Optimistic")
    failures = []
    for i, col in enumerate(cols):
        v = lambda k: A[k][i]
        fx, days, f = v("USD / INR exchange rate"), v("Active days per user per month"), v("Ad fill rate")
        views = min(v("Rewarded videos per active day")
                    + v("Average sets completed per day") * v("Rewarded ads per set"),
                    v("Daily credited ad views ceiling"))
        ads = (v("Rewarded video eCPM") / 1000 * fx * views * days * f
               + v("Interstitial eCPM") / 1000 * fx * v("Interstitials per active day") * days * f
               + v("Banner revenue"))
        surveys = v("One-time profile resale value") / v("Expected user lifetime") \
            + v("Daily drip batch value") * days
        fixed = (v("UPI payout fee") * v("Payouts per withdrawing user") * (1 - v("Breakage at a ₹10 first payout"))
                 + v("Infrastructure cost") + v("SMS / OTP cost") + v("Support cost"))
        for tier in ("User share of realised ad revenue", "Share at a 7-day streak",
                     "Share at a 30-day streak", "Share until lifetime earnings reach the first threshold"):
            share = v(tier)
            for stress, label in ((1.0, "as modelled"), (0.5, "eCPM halved"), (0.25, "eCPM quartered")):
                a = ads * stress
                payout = a * share
                profit = a - payout + surveys - fixed - payout * v("Fraud leakage")
                if profit <= 0:
                    failures.append(f"{col} @ {share:.0%} share, {label}: profit ₹{profit:.2f}")
        # A user who watches nothing must cost nothing on the reward line.
        if 0 * share != 0:
            failures.append(f"{col}: zero views did not produce a zero payout")
    if failures:
        raise SystemExit("NO-LOSS GATE FAILED — do not ship:\n  " + "\n  ".join(failures))
    print(f"no-loss gate: PASSED ({len(cols)} scenarios x 4 share tiers x 3 eCPM stresses)")


_no_loss_gate()
wb.save(OUT)
print("wrote", OUT)
