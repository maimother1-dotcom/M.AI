#!/usr/bin/env python3
"""Build the AlarmX unit-economics workbook (v0.3).

v0.3 change: the first payout drops to Rs10 (Rs30 thereafter). That lowers
breakage, which raises real cash cost, which lowers the sustainable cap. The
first payout itself is booked as customer acquisition, not as a reward.
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
    ("AlarmX — Unit Economics Model (v0.4)", TITLE, None),
    ("", None, None),
    ("What this answers", BOLD, None),
    ("How much cash AlarmX can pay one user per month without losing money.", BLACK, None),
    ("Every other number in the product spec is derived from that one.", BLACK, None),
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
for i, (text, font, fill) in enumerate(rows, start=1):
    c = rd.cell(row=i, column=1, value=text)
    if font:
        c.font = font
    if fill:
        c.fill = fill
rd.column_dimensions["A"].width = 100

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
    (9, "Rewarded videos per active day", 2, 3, 4, "views", "Assumption", NUM, False),
    (10, "Ad fill rate", 0.70, 0.80, 0.90, "%", "Share of ad requests returning a paying ad in India", PCT, False),
    (11, "Interstitial eCPM", 0.25, 0.40, 0.70, "$ per 1,000", "Materially below rewarded video", '$#,##0.00', False),
    (12, "Interstitials per active day", 3, 4, 6, "views", "Assumption", NUM, False),
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
]

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


section(5, "REVENUE")
line(6, "Rewarded video",
     "=Assumptions!{c}8*Assumptions!{c}5/1000*Assumptions!{c}9*Assumptions!{c}6*Assumptions!{c}10",
     note="eCPM → ₹/view × views/day × active days × fill rate")
line(7, "Interstitial",
     "=Assumptions!{c}11*Assumptions!{c}5/1000*Assumptions!{c}12*Assumptions!{c}6*Assumptions!{c}10")
line(8, "Banner", "=Assumptions!{c}13")
line(9, "Survey — one-time profile, amortised", "=Assumptions!{c}15/Assumptions!{c}16")
line(10, "Survey — daily drip", "=Assumptions!{c}17*Assumptions!{c}6",
     note="Why the survey drips instead of dumping once")
line(11, "Sponsored QR (dormant)", "=Assumptions!{c}19*Assumptions!{c}20*Assumptions!{c}6",
     note="₹0 until a brand signs")
line(12, "TOTAL REVENUE", "=SUM({c}6:{c}11)", bold=True, fill=OUT_FILL)

section(14, "NON-REWARD COSTS")
line(15, "UPI payout fees", "=Assumptions!{c}27*Assumptions!{c}28*(1-Assumptions!{c}24)",
     note="Only non-breakage users trigger a payout")
line(16, "Infrastructure", "=Assumptions!{c}29")
line(17, "SMS / OTP", "=Assumptions!{c}30")
line(18, "Support", "=Assumptions!{c}31")
line(19, "TOTAL NON-REWARD COST", "=SUM({c}15:{c}18)", bold=True, fill=OUT_FILL)

section(21, "REWARD BUDGET")
line(22, "Target profit retained", "={c}12*Assumptions!{c}34")
line(23, "Budget available for rewards", "={c}12-{c}19-{c}22", bold=True,
     note="Revenue less non-reward cost less target profit")
line(24, "Breakage factor (share actually paid)", "=1-Assumptions!{c}24", fmt=PCT)
line(25, "Fraud inflation factor", "=1+Assumptions!{c}32", fmt=NUM)
line(26, "SUSTAINABLE EARNING CAP", "={c}23/({c}24*{c}25)", fmt=RUP, bold=True, fill=OUT_FILL,
     note="Maximum a single user may accrue per month")

section(28, "WHAT THE ₹10 FIRST PAYOUT COSTS")
line(29, "Cap under v0.2 (₹30 first payout)",
     "=({c}12-(Assumptions!{c}27*Assumptions!{c}28*(1-Assumptions!{c}25)"
     "+Assumptions!{c}29+Assumptions!{c}30+Assumptions!{c}31)-{c}22)"
     "/((1-Assumptions!{c}25)*{c}25)",
     note="Same revenue, the higher v0.2 breakage assumption")
line(30, "Cap reduction from the ₹10 decision", "={c}26-{c}29", bold=True,
     note="Negative means the ₹10 first payout costs cap headroom")
line(31, "Reduction as % of the v0.2 cap", "=IF({c}29=0,0,{c}30/{c}29)", fmt=PCT, bold=True)

section(33, "ACQUISITION — separate book, NOT charged to the reward budget", CAC_FILL)
line(34, "First payout, cash", "=Assumptions!{c}22", fill=CAC_FILL)
line(35, "First payout, transaction fee", "=Assumptions!{c}27", fill=CAC_FILL)
line(36, "Total first-payout cost per converting user", "={c}34+{c}35", bold=True, fill=CAC_FILL)
line(37, "Blended across all installs", "={c}36*Assumptions!{c}36", fill=CAC_FILL,
     note="Only users who reach the threshold cost you this")
line(38, "Paid install cost (CPI) benchmark", "=Assumptions!{c}38", fill=CAC_FILL)
line(39, "First payout as % of a paid install", "=IF({c}38=0,0,{c}37/{c}38)", fmt=PCT,
     bold=True, fill=CAC_FILL,
     note="Under 100% means it buys a paid, retained user cheaper than an ad buys a raw install")
line(40, "Amortised over expected lifetime", "={c}37/Assumptions!{c}16", fill=CAC_FILL,
     note="Monthly equivalent, for comparison against revenue only")

section(42, "REALITY CHECK vs THE ORIGINAL ₹95 DESIGN")
for j in range(2, 5):
    c = m.cell(row=43, column=j, value=95)
    c.font = BLUE
    c.number_format = RUP0
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
c = m.cell(row=43, column=1, value="Original design cap (₹60 math + ₹30 streak + ₹5 signup)")
c.font = BLACK
c.border = BOX
m.cell(row=43, column=5, value="The concept as first specified").font = NOTE
line(44, "Sustainable cap as % of original", "={c}26/{c}43", fmt=PCT, bold=True)
line(45, "Monthly loss per user at the original cap",
     "={c}12-{c}19-({c}43*{c}24*{c}25)", fmt=RUP, bold=True,
     note="Contribution per user if ₹95 shipped unchanged")

m.column_dimensions["A"].width = 46
for col in "BCD":
    m.column_dimensions[col].width = 15
m.column_dimensions["E"].width = 58
m.freeze_panes = "B5"

# ------------------------------------------------------------------ SCALE
s = wb.create_sheet("Scale")
s.sheet_view.showGridLines = False
s["A1"] = "Monthly P&L at scale — Base case"
s["A1"].font = TITLE
s["A2"] = "Set the cap you intend to ship in the yellow cell. Acquisition is shown separately."
s["A2"].font = NOTE

s["A4"] = "Earning cap to test"
s["A4"].font = BOLD
s["B4"] = 15
s["B4"].font = BLUE
s["B4"].number_format = RUP0
s["B4"].fill = KEY_FILL
s["B4"].border = BOX
s["C4"] = "₹ per user per month"
s["C4"].font = NOTE

s["A5"] = "Sustainable cap (Base, from Model)"
s["B5"] = "=Model!C26"
s["B5"].font = GREEN
s["B5"].number_format = RUP
s["B5"].border = BOX
s["C5"] = "Ship at or below this"
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


srow(10, "Revenue", "={c}9*Model!$C$12")
srow(11, "Non-reward costs", "=-{c}9*Model!$C$19")
srow(12, "Reward payout at the tested cap", "=-{c}9*$B$4*Model!$C$24*Model!$C$25")
srow(13, "CONTRIBUTION before acquisition", "=SUM({c}10:{c}12)", bold=True, fill=OUT_FILL)
srow(14, "Acquisition — first payouts", "=-{c}9*$B$6*Model!$C$37", fill=CAC_FILL,
     note="One-off per new user, not a recurring reward")
srow(15, "CONTRIBUTION after acquisition", "={c}13+{c}14", bold=True, fill=OUT_FILL)
srow(16, "Margin after acquisition", "=IF({c}10=0,0,{c}15/{c}10)", fmt=PCT, bold=True, fill=OUT_FILL)
srow(18, "Contribution at the ORIGINAL ₹95 cap",
     "={c}9*Model!$C$12-{c}9*Model!$C$19-{c}9*Model!$C$43*Model!$C$24*Model!$C$25",
     bold=True, note="What shipping the original design would cost monthly")

s.column_dimensions["A"].width = 42
for col in "BCD":
    s.column_dimensions[col].width = 18
s.column_dimensions["E"].width = 46

# ------------------------------------------------------------ SENSITIVITY
sn = wb.create_sheet("Sensitivity")
sn.sheet_view.showGridLines = False
sn["A1"] = "Contribution per user per month (before acquisition)"
sn["A1"].font = TITLE
sn["A2"] = "Rows = earning cap shipped. Columns = total revenue per active user. Base-case costs, breakage and fraud."
sn["A2"].font = NOTE
sn["A3"] = "Bracketed values are losses on every active user at that combination."
sn["A3"].font = NOTE

REV = [10, 15, 20, 25, 30, 35, 40, 50]
CAPS = [5, 10, 15, 20, 25, 30, 40, 60, 95]

c = sn["A5"]
c.value = "Cap \\ Revenue"
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
    c.number_format = RUP0
    c.alignment = Alignment(horizontal="center")
    if cap == 95:
        c.fill = KEY_FILL
    c.border = BOX
    for j in range(2, len(REV) + 2):
        col = get_column_letter(j)
        cc = sn.cell(row=i, column=j,
                     value=f"={col}$5-Model!$C$19-$A{i}*Model!$C$24*Model!$C$25")
        cc.number_format = RUP
        cc.border = BOX

sn.cell(row=len(CAPS) + 7, column=1,
        value="₹95 is the original design. Every negative cell on that row is a loss per user per month.").font = NOTE
sn.column_dimensions["A"].width = 20
for j in range(2, len(REV) + 2):
    sn.column_dimensions[get_column_letter(j)].width = 13

wb.save(OUT)
print("wrote", OUT)
