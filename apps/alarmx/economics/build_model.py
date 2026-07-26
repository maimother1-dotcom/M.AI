#!/usr/bin/env python3
"""Build the AlarmX unit-economics workbook."""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = "/home/user/M.AI/apps/alarmx/economics/AlarmX-unit-economics.xlsx"

FONT = "Arial"
BLUE = Font(name=FONT, size=10, color="0000FF")          # hardcoded input
BLACK = Font(name=FONT, size=10)                          # formula
GREEN = Font(name=FONT, size=10, color="008000")          # cross-sheet link
BOLD = Font(name=FONT, size=10, bold=True)
BOLD_WHITE = Font(name=FONT, size=11, bold=True, color="FFFFFF")
TITLE = Font(name=FONT, size=14, bold=True)
NOTE = Font(name=FONT, size=9, italic=True, color="595959")

HDR_FILL = PatternFill("solid", fgColor="1F3864")
SEC_FILL = PatternFill("solid", fgColor="D9E2F3")
KEY_FILL = PatternFill("solid", fgColor="FFFF00")
OUT_FILL = PatternFill("solid", fgColor="E2EFDA")

RUP = '₹#,##0.00;(₹#,##0.00);-'
RUP0 = '₹#,##0;(₹#,##0);-'
PCT = '0.0%;(0.0%);-'
NUM = '#,##0.0;(#,##0.0);-'
INT = '#,##0;(#,##0);-'

thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ----------------------------------------------------------------------------
# README
# ----------------------------------------------------------------------------
rd = wb.active
rd.title = "README"
rd.sheet_view.showGridLines = False

rows = [
    ("AlarmX — Unit Economics Model", TITLE, None),
    ("", None, None),
    ("What this answers", BOLD, None),
    ("How much cash AlarmX can pay a single user per month without losing money.", BLACK, None),
    ("Everything else in the product spec depends on that one number.", BLACK, None),
    ("", None, None),
    ("How to use it", BOLD, None),
    ("1. Open the Assumptions tab. Edit ONLY the blue cells.", BLACK, None),
    ("2. Three scenario columns: Conservative / Base / Optimistic. Base is the planning case.", BLACK, None),
    ("3. The Model tab computes the sustainable earning cap for each scenario. Nothing there is typed by hand.", BLACK, None),
    ("4. The Scale tab shows monthly P&L at 10k / 100k / 1M MAU. Set your chosen cap in the yellow cell.", BLACK, None),
    ("5. The Sensitivity tab shows contribution per user across a grid of caps and revenue levels.", BLACK, None),
    ("", None, None),
    ("Colour key", BOLD, None),
    ("Blue text = hardcoded input you can edit", BLUE, None),
    ("Black text = formula, do not overwrite", BLACK, None),
    ("Green text = link to another sheet", GREEN, None),
    ("Yellow fill = key assumption or a cell you must fill in", BLACK, KEY_FILL),
    ("", None, None),
    ("Where the numbers came from", BOLD, None),
    ("Rewarded video eCPM: India Android rewarded video benchmarked at roughly $1.50 eCPM;", BLACK, None),
    ("  India across ad types spans $0.50–$2.00. Tier-2/3 traffic generally $3–$10, but India sits", BLACK, None),
    ("  at the low end of that band. Source: Coinis rewarded-video glossary; Business of Apps.", BLACK, None),
    ("UPI payout fee: RazorpayX payouts ₹2–₹5 per payout, UPI at the low end of that range.", BLACK, None),
    ("  Source: RazorpayX pricing. Verify the live price card before committing.", BLACK, None),
    ("Survey resale values: NOT sourced. These are placeholders and the least reliable inputs in", BLACK, None),
    ("  the model. Validate them with an actual data buyer before trusting any output.", BLACK, None),
    ("All other inputs are assumptions set by Bijoy or by Claude and flagged as such.", BLACK, None),
    ("", None, None),
    ("Health warning", BOLD, None),
    ("The Conservative column is not a pessimism exercise. It is what happens if ad fill and eCPM", BLACK, None),
    ("come in at the low end of the published India range, which is a realistic first-year outcome", BLACK, None),
    ("for a new app with no traffic history. Read that column before setting the cap.", BLACK, None),
]
for i, (text, font, fill) in enumerate(rows, start=1):
    c = rd.cell(row=i, column=1, value=text)
    if font:
        c.font = font
    if fill:
        c.fill = fill
rd.column_dimensions["A"].width = 105

# ----------------------------------------------------------------------------
# Assumptions
# ----------------------------------------------------------------------------
a = wb.create_sheet("Assumptions")
a.sheet_view.showGridLines = False

a["A1"] = "Assumptions — edit the blue cells only"
a["A1"].font = TITLE

hdr = ["Input", "Conservative", "Base", "Optimistic", "Unit", "Source / note"]
for j, h in enumerate(hdr, start=1):
    c = a.cell(row=3, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BOX

# (row, label, cons, base, opt, unit, note, fmt, is_section)
DATA = [
    (4, "GLOBAL", None, None, None, None, None, None, True),
    (5, "USD / INR exchange rate", 88, 88, 88, "₹ per $", "Assumption, 2026", NUM, False),
    (6, "Active days per user per month", 20, 26, 30, "days", "Days the user opens the app and completes an alarm", NUM, False),

    (7, "AD REVENUE", None, None, None, None, None, None, True),
    (8, "Rewarded video eCPM", 1.00, 1.50, 2.50, "$ per 1,000", "India Android rewarded ~$1.50; India range $0.50–$2.00", '$#,##0.00', False),
    (9, "Rewarded videos per active day", 2, 3, 4, "views", "Assumption — how many the user will actually sit through", NUM, False),
    (10, "Ad fill rate", 0.70, 0.80, 0.90, "%", "Share of ad requests that return a paying ad in India", PCT, False),
    (11, "Interstitial eCPM", 0.25, 0.40, 0.70, "$ per 1,000", "Materially below rewarded video", '$#,##0.00', False),
    (12, "Interstitials per active day", 3, 4, 6, "views", "Assumption", NUM, False),
    (13, "Banner revenue", 1.00, 2.00, 4.00, "₹/user/month", "Assumption — banners earn very little in India", RUP, False),

    (14, "SURVEY DATA RESALE", None, None, None, None, None, None, True),
    (15, "One-time profile resale value", 8, 15, 30, "₹ per user", "PLACEHOLDER — validate with a real buyer", RUP, False),
    (16, "Expected user lifetime", 3, 4, 6, "months", "Used to amortise the one-time value", NUM, False),
    (17, "Daily drip batch value", 0.15, 0.25, 0.50, "₹ per batch", "PLACEHOLDER — 2–3 questions answered per day", RUP, False),

    (18, "SPONSORED QR — DORMANT TODAY", None, None, None, None, None, None, True),
    (19, "Sponsored scans per active day", 0, 0, 0, "scans", "ZERO until a brand partnership signs. Rails built, switch off.", NUM, False),
    (20, "Brand-funded value per scan", 0.50, 1.00, 2.00, "₹ per scan", "For scenario testing only — no revenue until row 19 > 0", RUP, False),

    (21, "COSTS", None, None, None, None, None, None, True),
    (22, "UPI payout fee", 5.00, 3.00, 2.00, "₹ per payout", "RazorpayX ₹2–5 per payout; UPI at the low end", RUP, False),
    (23, "Payouts per withdrawing user", 1, 1, 1, "per month", "Monthly batch payout keeps this at 1", NUM, False),
    (24, "Breakage — earned but never withdrawn", 0.25, 0.40, 0.55, "%", "Users who churn below the ₹30 minimum. Real, and it matters a lot.", PCT, False),
    (25, "Infrastructure cost", 0.80, 0.50, 0.30, "₹/MAU/month", "Firebase, Firestore, Cloud Functions, Play Integrity", RUP, False),
    (26, "SMS / OTP cost", 0.30, 0.15, 0.10, "₹/user/month", "Assumption", RUP, False),
    (27, "Support cost", 0.60, 0.30, 0.15, "₹/user/month", "Withdrawal disputes dominate this line", RUP, False),
    (28, "Fraud leakage", 0.10, 0.05, 0.02, "% of rewards", "Rupees paid to accounts that beat the fraud controls", PCT, False),

    (29, "TARGETS", None, None, None, None, None, None, True),
    (30, "Target contribution margin", 0.30, 0.30, 0.30, "% of revenue", "Profit retained before the reward budget is set", PCT, False),
    (31, "Minimum withdrawal threshold", 30, 30, 30, "₹", "Product decision — drives the breakage rate above", RUP0, False),
]

for row, label, cons, base, opt, unit, note, fmt, is_sec in DATA:
    if is_sec:
        for j in range(1, 7):
            c = a.cell(row=row, column=j)
            c.fill = SEC_FILL
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

# highlight the load-bearing assumptions
for r in (8, 15, 17, 24):
    for j in range(2, 5):
        a.cell(row=r, column=j).fill = KEY_FILL

a.column_dimensions["A"].width = 38
for col in "BCD":
    a.column_dimensions[col].width = 14
a.column_dimensions["E"].width = 14
a.column_dimensions["F"].width = 62
a.freeze_panes = "B4"

# ----------------------------------------------------------------------------
# Model
# ----------------------------------------------------------------------------
m = wb.create_sheet("Model")
m.sheet_view.showGridLines = False

m["A1"] = "Per-user monthly economics and the sustainable earning cap"
m["A1"].font = TITLE
m["A2"] = "Every figure below is per active user per month. Nothing here is typed by hand."
m["A2"].font = NOTE

for j, h in enumerate(["Line item", "Conservative", "Base", "Optimistic", "Note"], start=1):
    c = m.cell(row=4, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BOX

def section(row, label):
    for j in range(1, 6):
        c = m.cell(row=row, column=j)
        c.fill = SEC_FILL
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
        c.font = BOLD if bold else GREEN if "Assumptions!" in tmpl and "{" in tmpl else BLACK
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
     note="eCPM → ₹ per view × views/day × active days × fill rate")
line(7, "Interstitial",
     "=Assumptions!{c}11*Assumptions!{c}5/1000*Assumptions!{c}12*Assumptions!{c}6*Assumptions!{c}10")
line(8, "Banner", "=Assumptions!{c}13")
line(9, "Survey — one-time profile, amortised",
     "=Assumptions!{c}15/Assumptions!{c}16", note="One-time value spread over expected lifetime")
line(10, "Survey — daily drip",
     "=Assumptions!{c}17*Assumptions!{c}6", note="This is why the survey drips instead of dumping once")
line(11, "Sponsored QR (dormant)",
     "=Assumptions!{c}19*Assumptions!{c}20*Assumptions!{c}6", note="₹0 until a brand signs")
line(12, "TOTAL REVENUE", "=SUM({c}6:{c}11)", bold=True, fill=OUT_FILL)

section(14, "NON-REWARD COSTS")
line(15, "UPI payout fees",
     "=Assumptions!{c}22*Assumptions!{c}23*(1-Assumptions!{c}24)",
     note="Only non-breakage users ever trigger a payout")
line(16, "Infrastructure", "=Assumptions!{c}25")
line(17, "SMS / OTP", "=Assumptions!{c}26")
line(18, "Support", "=Assumptions!{c}27")
line(19, "TOTAL NON-REWARD COST", "=SUM({c}15:{c}18)", bold=True, fill=OUT_FILL)

section(21, "REWARD BUDGET")
line(22, "Target profit retained", "={c}12*Assumptions!{c}30", note="Contribution margin held back before rewards")
line(23, "Budget available for rewards", "={c}12-{c}19-{c}22", bold=True,
     note="Revenue less non-reward cost less target profit")
line(24, "Breakage factor", "=1-Assumptions!{c}24", fmt=PCT, note="Share of accrued rewards actually paid out")
line(25, "Fraud inflation factor", "=1+Assumptions!{c}28", fmt=NUM, note="Rupees leaked to accounts that beat the controls")
line(26, "SUSTAINABLE EARNING CAP", "={c}23/({c}24*{c}25)", fmt=RUP, bold=True, fill=OUT_FILL,
     note="Max a single user may accrue per month")

section(28, "REALITY CHECK vs ORIGINAL DESIGN")
for j, col in ((2, "B"), (3, "C"), (4, "D")):
    c = m.cell(row=29, column=j, value=95)
    c.font = BLUE
    c.number_format = RUP0
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
m.cell(row=29, column=1, value="Original design cap (₹60 math + ₹30 streak + ₹5 signup)").font = BLACK
m.cell(row=29, column=1).border = BOX
m.cell(row=29, column=5, value="The concept as originally specified").font = NOTE
line(30, "Sustainable cap as % of original", "={c}26/{c}29", fmt=PCT, bold=True,
     note="Below 100% means the original design pays out more than it earns")
line(31, "Monthly loss per user at the original cap",
     "={c}12-{c}19-({c}29*{c}24*{c}25)", fmt=RUP, bold=True,
     note="Contribution per user if you shipped ₹95 unchanged")

m.column_dimensions["A"].width = 46
for col in "BCD":
    m.column_dimensions[col].width = 15
m.column_dimensions["E"].width = 58
m.freeze_panes = "B5"

# ----------------------------------------------------------------------------
# Scale
# ----------------------------------------------------------------------------
s = wb.create_sheet("Scale")
s.sheet_view.showGridLines = False

s["A1"] = "Monthly P&L at scale — Base case"
s["A1"].font = TITLE
s["A2"] = "Set the cap you intend to ship in the yellow cell. Compare against the sustainable cap on the Model tab."
s["A2"].font = NOTE

s["A4"] = "Earning cap to test"
s["A4"].font = BOLD
s["B4"] = 20
s["B4"].font = BLUE
s["B4"].number_format = RUP0
s["B4"].fill = KEY_FILL
s["B4"].border = BOX
s["C4"] = "₹ per user per month"
s["C4"].font = NOTE

s["A5"] = "Sustainable cap (Base, from Model)"
s["A5"].font = BLACK
s["B5"] = "=Model!C26"
s["B5"].font = GREEN
s["B5"].number_format = RUP
s["B5"].border = BOX
s["C5"] = "Ship at or below this number"
s["C5"].font = NOTE

for j, h in enumerate(["Line item", "10k MAU", "100k MAU", "1M MAU"], start=1):
    c = s.cell(row=7, column=j, value=h)
    c.font = BOLD_WHITE
    c.fill = HDR_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = BOX

MAU = {"B": 10000, "C": 100000, "D": 1000000}
for col, v in MAU.items():
    c = s[f"{col}8"]
    c.value = v
    c.font = BLUE
    c.number_format = INT
    c.border = BOX
    c.alignment = Alignment(horizontal="center")
s["A8"] = "Monthly active users"
s["A8"].font = BLACK
s["A8"].border = BOX

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

srow(9, "Revenue", "={c}8*Model!$C$12")
srow(10, "Non-reward costs", "=-{c}8*Model!$C$19")
srow(11, "Reward payout at the tested cap", "=-{c}8*$B$4*Model!$C$24*Model!$C$25",
     note="Cap × share actually withdrawn × fraud inflation")
srow(12, "CONTRIBUTION", "=SUM({c}9:{c}11)", bold=True, fill=OUT_FILL)
srow(13, "Contribution margin", "=IF({c}9=0,0,{c}12/{c}9)", fmt=PCT, bold=True, fill=OUT_FILL)
srow(15, "Contribution at the ORIGINAL ₹95 cap",
     "={c}8*Model!$C$12-{c}8*Model!$C$19-{c}8*Model!$C$29*Model!$C$24*Model!$C$25",
     bold=True, note="What shipping the original design would have cost per month")

s.column_dimensions["A"].width = 40
for col in "BCD":
    s.column_dimensions[col].width = 18
s.column_dimensions["E"].width = 50

# ----------------------------------------------------------------------------
# Sensitivity
# ----------------------------------------------------------------------------
sn = wb.create_sheet("Sensitivity")
sn.sheet_view.showGridLines = False

sn["A1"] = "Contribution per user per month"
sn["A1"].font = TITLE
sn["A2"] = "Rows = earning cap you ship. Columns = total revenue per active user. Base-case costs, breakage and fraud applied."
sn["A2"].font = NOTE
sn["A3"] = "Negative (in brackets) means you lose money on every active user at that combination."
sn["A3"].font = NOTE

REV = [10, 15, 20, 25, 30, 35, 40, 50]
CAPS = [5, 10, 15, 20, 25, 30, 40, 60, 95]

sn["A5"] = "Cap \\ Revenue per user"
sn["A5"].font = BOLD_WHITE
sn["A5"].fill = HDR_FILL
sn["A5"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
sn["A5"].border = BOX

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
    c.fill = KEY_FILL if cap == 95 else PatternFill()
    c.border = BOX
    for j in range(2, len(REV) + 2):
        col = get_column_letter(j)
        cc = sn.cell(row=i, column=j,
                     value=f"={col}$5-Model!$C$19-$A{i}*Model!$C$24*Model!$C$25")
        cc.font = BLACK
        cc.number_format = RUP
        cc.border = BOX

sn.cell(row=len(CAPS) + 7, column=1,
        value="₹95 row is the original design. Everything to the left of break-even on that row is a loss per user per month.").font = NOTE

sn.column_dimensions["A"].width = 24
for j in range(2, len(REV) + 2):
    sn.column_dimensions[get_column_letter(j)].width = 13

wb.save(OUT)
print("wrote", OUT)
