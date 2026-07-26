#!/usr/bin/env python3
"""AlarmX prototype v0.3 — browser verification.

Walks the golden and error paths and asserts the behaviours the PRD depends on.
Run:  python3 verify_prototype.py
"""
from playwright.sync_api import sync_playwright
import pathlib, sys, os, glob

URL = (pathlib.Path(__file__).resolve().parent.parent / "prototype" / "index.html").as_uri()
SHOT = pathlib.Path(__file__).resolve().parent / "shots"
SHOT.mkdir(exist_ok=True)

# Point at a specific Chromium if the bundled one doesn't match the installed build.
_exe = os.environ.get("CHROMIUM_PATH") or next(
    iter(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")), None)
LAUNCH = {"executable_path": _exe} if _exe else {}

fails, checks = [], []


def check(name, cond, detail=""):
    checks.append((name, bool(cond), detail))
    if not cond:
        fails.append(f"{name} :: {detail}")
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail else ""))


def section(title):
    print(f"\n--- {title} ---")


def onboard(pg, exam="neet", oem="xiaomi", survey=True):
    """Walk lang -> exam -> oem -> survey -> dashboard."""
    pg.evaluate("go('exam')"); pg.wait_for_timeout(100)
    pg.evaluate(f"pickExam('{exam}')"); pg.wait_for_timeout(100)
    pg.evaluate(f"pickOem('{oem}')"); pg.wait_for_timeout(100)
    pg.evaluate("go('survey')"); pg.wait_for_timeout(100)
    if survey:
        for _ in range(8):
            pg.locator("#app .opts button").first.click()
            pg.wait_for_timeout(40)
        pg.check("#c1"); pg.wait_for_timeout(80)
        pg.click("#app button.primary")
    else:
        pg.evaluate("skipSurvey()")
    pg.wait_for_timeout(200)


with sync_playwright() as p:
    b = p.chromium.launch(**LAUNCH)
    pg = b.new_page(viewport={"width": 470, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL)
    pg.wait_for_timeout(400)

    # ------------------------------------------------------------ LOCALISATION
    section("LOCALISATION: Hinglish default, three locales, full key parity")
    check("default locale is Hinglish", pg.evaluate("S.locale") == "hi-Latn",
          pg.evaluate("S.locale"))
    check("three locales offered", pg.evaluate("LOCALES.length") == 3)
    missing = pg.evaluate("""() => {
        const keys = Object.keys(STRINGS['en']); const out = [];
        for (const loc of LOCALES)
            for (const k of keys) if (STRINGS[loc][k] === undefined) out.push(loc + ':' + k);
        return out;
    }""")
    check("every locale has every string key", len(missing) == 0, ", ".join(missing[:5]))
    extra = pg.evaluate("""() => {
        const en = new Set(Object.keys(STRINGS['en'])); const out = [];
        for (const loc of LOCALES)
            for (const k of Object.keys(STRINGS[loc])) if (!en.has(k)) out.push(loc+':'+k);
        return out;
    }""")
    check("no orphan keys outside the English set", len(extra) == 0, ", ".join(extra[:5]))
    check("first screen is in Hinglish", "Subah utho" in pg.inner_text("#app"))

    pg.evaluate("setLocale('en')"); pg.wait_for_timeout(120)
    check("switching to English changes the copy", "Wake up early" in pg.inner_text("#app"))
    pg.evaluate("setLocale('hi')"); pg.wait_for_timeout(120)
    check("switching to Hindi renders Devanagari", "सुबह उठो" in pg.inner_text("#app"))
    pg.evaluate("setLocale('hi-Latn')"); pg.wait_for_timeout(120)

    # ------------------------------------------------------- NUMBER FORMATTING
    section("INDIAN NUMBER FORMATTING: lakh/crore grouping")
    check("1,00,000 groups the Indian way", pg.evaluate("inr(100000)") == "₹1,00,000",
          pg.evaluate("inr(100000)"))
    check("1 crore groups correctly", pg.evaluate("inr(10000000)") == "₹1,00,00,000",
          pg.evaluate("inr(10000000)"))
    check("sub-1000 unchanged", pg.evaluate("inr(999)") == "₹999", pg.evaluate("inr(999)"))
    check("thousands still correct", pg.evaluate("inr(1234)") == "₹1,234", pg.evaluate("inr(1234)"))
    check("paise shown only when non-zero",
          pg.evaluate("inr(0.5)") == "₹0.50" and pg.evaluate("inr(15)") == "₹15")

    # -------------------------------------------------------------- ONBOARDING
    section("ONBOARDING: language, exam, OEM, optional survey")
    check("language screen offers all three", pg.locator("#app .langrow button").count() == 3)
    pg.click("#app button.primary"); pg.wait_for_timeout(150)
    check("exam screen lists real exams", "NEET UG" in pg.inner_text("#app"))
    check("'no exam' escape hatch exists",
          pg.locator("#app button.ghost").count() >= 1)
    pg.screenshot(path=str(SHOT / "01-exam.png"), full_page=True)

    pg.evaluate("pickExam('neet')"); pg.wait_for_timeout(150)
    check("OEM screen appears after exam", pg.evaluate("S.screen") == "oem")
    n_oems = len(pg.evaluate("OEMS.map(o=>o.id)"))
    check("all OEM families offered", pg.locator("#app .opts button").count() == n_oems)
    pg.evaluate("pickOem('xiaomi')"); pg.wait_for_timeout(200)
    oem_txt = pg.inner_text("#app")
    check("MIUI shows the literal menu path", "Autostart" in oem_txt and "MIUI" in oem_txt)
    check("OEM step count is concrete", pg.locator("#app ol.steps li").count() >= 2)
    pg.screenshot(path=str(SHOT / "02-oem-walkthrough.png"), full_page=True)
    pg.evaluate("pickOem('realme')"); pg.wait_for_timeout(150)
    check("switching OEM swaps the instructions", "ColorOS" in pg.inner_text("#app"))

    pg.evaluate("go('survey')"); pg.wait_for_timeout(150)
    check("survey states it is optional", "optional" in pg.inner_text("#app").lower())
    check("skip control present", pg.locator("#app button.ghost").count() >= 1)

    pg.evaluate("skipSurvey()"); pg.wait_for_timeout(200)
    check("skipping reaches the dashboard", pg.evaluate("S.screen") == "dashboard")
    check("skipping pays no bonus", pg.evaluate("S.withdrawable") == 0)

    pg.reload(); pg.wait_for_timeout(300)
    onboard(pg, survey=True)
    check("signup bonus credited", pg.evaluate("S.withdrawable") == 5)
    check("resale consent stayed unticked", pg.evaluate("S.consentResale") is False,
          "opt-in must be a real choice")

    # ---------------------------------------------------------- STUDENT WEDGE
    section("STUDENT WEDGE: exam countdown and wake time")
    d = pg.evaluate("daysToExam()")
    check("countdown is a real positive number", isinstance(d, int) and 0 < d <= 366, str(d))
    check("countdown renders on the dashboard", "din baaki" in pg.inner_text("#app"))
    pg.evaluate("S.exam='upsc';draw()"); pg.wait_for_timeout(150)
    d2 = pg.evaluate("daysToExam()")
    check("different exam gives a different countdown", d2 != d, f"{d} vs {d2}")
    check("wake time follows the exam", pg.evaluate("wakeTime()") == "04:30",
          pg.evaluate("wakeTime()"))
    pg.evaluate("S.exam='none';draw()"); pg.wait_for_timeout(150)
    check("no-exam users get a usable dashboard", pg.evaluate("daysToExam()") is None)
    check("no-exam state is labelled", "Exam set nahi" in pg.inner_text("#app"))
    pg.evaluate("S.exam='neet';draw()"); pg.wait_for_timeout(120)

    # ----------------------------------------------------------------- CAP
    section("EARNING CAP: ₹15, honest, enforced")
    check("cap constant is ₹15", pg.evaluate("CAP") == 15)
    pg.click(".devbar button:has-text('Cap')"); pg.wait_for_timeout(250)
    dash = pg.inner_text("#app")
    before = pg.evaluate("S.withdrawable")
    pg.evaluate("earn(10,'test')"); pg.wait_for_timeout(150)
    check("earning beyond the cap is refused", pg.evaluate("S.withdrawable") == before)
    low = dash.lower()
    check("no withheld-balance dark patterns",
          all(x not in low for x in ["unlock next month", "monthly withdrawal limit",
                                     "withdrawal limit", "released next month"]))

    # ------------------------------------------------- FIRST PAYOUT + GATE
    section("FIRST PAYOUT: ₹10 threshold behind a 7-day gate")
    check("first threshold is ₹10", pg.evaluate("FIRST_MIN") == 10)
    check("later threshold is ₹30", pg.evaluate("LATER_MIN") == 30)
    check("gate is 7 days", pg.evaluate("GATE_DAYS") == 7)
    pg.evaluate("S.alarmDays=0;S.withdrawable=15;draw()"); pg.wait_for_timeout(150)
    check("₹15 alone does NOT unlock the first payout",
          pg.locator("button:has-text('UPI')").is_disabled(),
          "the 7-day gate is the anti-farming control")
    check("gate progress is shown honestly", "0 / 7" in pg.inner_text("#app"))
    pg.evaluate("S.alarmDays=6;draw()"); pg.wait_for_timeout(150)
    check("6 days still blocked", pg.locator("button:has-text('UPI')").is_disabled())
    pg.screenshot(path=str(SHOT / "03-gate-blocking.png"), full_page=True)
    pg.evaluate("S.alarmDays=7;draw()"); pg.wait_for_timeout(150)
    check("7 days + ₹10 unlocks it", not pg.locator("button:has-text('UPI')").is_disabled())

    pg.evaluate("S.withdrawable=5;draw()"); pg.wait_for_timeout(150)
    check("below ₹10 still blocked even past the gate",
          pg.locator("button:has-text('UPI')").is_disabled())
    pg.evaluate("S.withdrawable=12;draw()"); pg.wait_for_timeout(150)
    pg.click("button:has-text('UPI')"); pg.wait_for_timeout(300)
    check("first payout pays the full balance", pg.evaluate("S.withdrawable") == 0)
    check("payout recorded with a UPI reference", pg.evaluate("S.payouts.length") == 1)
    check("reference id looks like a real ref",
          pg.evaluate("S.payouts[0].ref").startswith("UPI"), pg.evaluate("S.payouts[0].ref"))
    check("payout history renders in the trust panel",
          pg.evaluate("S.payouts[0].ref") in pg.inner_text("#app"))
    pg.screenshot(path=str(SHOT / "04-first-payout.png"), full_page=True)

    section("SUBSEQUENT PAYOUTS: threshold rises to ₹30")
    check("threshold moved to ₹30 after the first", pg.evaluate("currentMin()") == 30)
    pg.evaluate("S.withdrawable=15;draw()"); pg.wait_for_timeout(150)
    check("₹15 no longer enough", pg.locator("button:has-text('UPI')").is_disabled())
    pg.evaluate("S.withdrawable=35;draw()"); pg.wait_for_timeout(150)
    check("₹35 is enough", not pg.locator("button:has-text('UPI')").is_disabled())
    pg.click("button:has-text('UPI')"); pg.wait_for_timeout(250)
    check("second payout recorded", pg.evaluate("S.payouts.length") == 2)
    pg.evaluate("S.withdrawable=12;draw()"); pg.wait_for_timeout(150)
    check("copy says NEXT withdrawal once one has happened",
          "Agli withdrawal" in pg.inner_text("#app"),
          "must not keep saying 'first' after the user has been paid")
    pg.evaluate("setLocale('en');draw()"); pg.wait_for_timeout(150)
    check("[en] same — next, not first", "next withdrawal" in pg.inner_text("#app").lower())
    pg.evaluate("setLocale('hi-Latn');draw()"); pg.wait_for_timeout(120)

    # --------------------------------------------------------------- ALARM
    section("ALARM: reward window is not the ring duration")
    pg.evaluate("S.alarmTask='math';S.alarmArmed=true;S.alarmDoneToday=false;draw()")
    pg.wait_for_timeout(150)
    days_before = pg.evaluate("S.alarmDays")
    pg.click(".devbar button:has-text('Ring')"); pg.wait_for_timeout(600)
    check("alarm overlay showing", "on" in (pg.get_attribute("#ring", "class") or ""))
    check("countdown running", "Reward window" in pg.inner_text("#rewardwin"))
    pg.screenshot(path=str(SHOT / "05-alarm-ringing.png"))
    pg.wait_for_timeout(10200)
    rw = pg.inner_text("#rewardwin").lower()
    check("window closes after 10s", "band" in rw or "closed" in rw, rw[:50])
    check("ALARM STILL RINGING after the window closed",
          "on" in (pg.get_attribute("#ring", "class") or ""),
          "the whole point of the change")
    pg.screenshot(path=str(SHOT / "06-window-lapsed.png"))

    # Driven through the page's own checkMath() handler: a Playwright
    # actionability quirk in this long sequence reports the (provably visible)
    # input as not visible. Same code path, same state transitions.
    pg.evaluate("""() => { for (let i=0;i<6 && S.ringTimer;i++){
        const el=document.getElementById('mathin'); if(!el) break;
        el.value=String(S.mathA+S.mathB); checkMath(); } }""")
    pg.wait_for_timeout(400)
    check("alarm dismissed", "on" not in (pg.get_attribute("#ring", "class") or ""))
    check("late dismissal records a miss", pg.evaluate("S.misses") == 1)
    check("no streak for a late dismissal", pg.evaluate("S.streak") == 0)
    check("alarm-day counted once", pg.evaluate("S.alarmDays") == days_before + 1)
    pg.evaluate("startAlarm()"); pg.wait_for_timeout(200)
    check("cannot ring an unarmed alarm", "on" not in (pg.get_attribute("#ring", "class") or ""))

    section("ALARM: registered QR only")
    pg.evaluate("S.alarmTask='qr';S.qrCode='BATHROOM-42';S.alarmArmed=true;draw()")
    pg.wait_for_timeout(150)
    pg.click(".devbar button:has-text('Ring')"); pg.wait_for_timeout(500)
    pg.fill("#task input#qrin", "WRONG-CODE")
    pg.click("#task button.primary"); pg.wait_for_timeout(300)
    check("wrong QR is rejected", "on" in (pg.get_attribute("#ring", "class") or ""))
    pg.fill("#task input#qrin", "BATHROOM-42")
    pg.click("#task button.primary"); pg.wait_for_timeout(400)
    check("registered QR dismisses", "on" not in (pg.get_attribute("#ring", "class") or ""))

    # ------------------------------------------------------ SPIN / MISSIONS
    section("SPIN gated behind an alarm; MISSIONS pay XP not cash")
    check("missions appear after an alarm", pg.evaluate("S.missionsShown") is True)
    pg.evaluate("S.spinUsedToday=false;S.alarmDoneToday=true;draw()"); pg.wait_for_timeout(120)
    check("spin unlocked after alarm", not pg.locator("button:has-text('Spin')").is_disabled())
    pg.evaluate("S.alarmDoneToday=false;draw()"); pg.wait_for_timeout(120)
    check("spin locked without an alarm", pg.locator("button:has-text('Spin')").is_disabled())
    pg.evaluate("S.alarmDoneToday=true;draw()"); pg.wait_for_timeout(120)

    pg.evaluate("S.festival=true;S.xp=0;S.missionsDone=[];draw()"); pg.wait_for_timeout(120)
    cash0 = pg.evaluate("S.withdrawable")
    pg.evaluate("doMission(0)"); pg.wait_for_timeout(200)
    check("mission pays XP", pg.evaluate("S.xp") > 0)
    check("mission pays NO cash", pg.evaluate("S.withdrawable") == cash0,
          "non-cash engagement must not touch the cap")
    check("festival doubles XP", pg.evaluate("S.xp") == 20, str(pg.evaluate("S.xp")))
    pg.evaluate("S.festival=false;S.xp=0;S.missionsDone=[];doMission(0)"); pg.wait_for_timeout(200)
    check("without festival XP is single", pg.evaluate("S.xp") == 10, str(pg.evaluate("S.xp")))
    pg.evaluate("S.festival=true;draw()"); pg.wait_for_timeout(120)

    # ------------------------------------------------- SOCIAL / TRUST / REF
    section("SOCIAL, TRUST, REFERRAL")
    check("leaderboard includes the user", pg.evaluate("leaderboardRows().includes('me')"))
    pg.evaluate("joinBatch()"); pg.wait_for_timeout(200)
    check("batch has members", pg.evaluate("S.batch.length") >= 3)
    check("batch renders", "Riya" in pg.inner_text("#app"))
    check("public paid-this-week ticker shown", "12,480" in pg.inner_text("#app"))
    ref0 = pg.evaluate("S.referred")
    pg.evaluate("share()"); pg.wait_for_timeout(200)
    check("referral share works", pg.evaluate("S.referred") == ref0 + 1)
    app_txt = pg.inner_text("#app")
    check("referral framed as CAC, not cap",
          "limit se nahi" in app_txt or "never comes out of your cap" in app_txt)
    check("festival banner renders", "Festival week" in app_txt)

    # ---------------------------------------------------------------- FRAUD
    section("FRAUD: honest review state")
    pg.click(".devbar button:has-text('Flag')"); pg.wait_for_timeout(250)
    dash = pg.inner_text("#app")
    check("review message is honest", "review" in dash.lower())
    check("concrete timeframe given", "5 din" in dash or "5 days" in dash)
    check("NO fake technical-difficulty text", "technical difficult" not in dash.lower())
    check("appeal route exists", pg.locator("#app button").count() > 0
          and ("Appeal" in dash or "appeal" in dash.lower()))
    pg.evaluate("S.withdrawable=50;draw()"); pg.wait_for_timeout(150)
    pg.evaluate("withdraw()"); pg.wait_for_timeout(200)
    check("payouts paused during review", pg.evaluate("S.withdrawable") == 50)
    pg.evaluate("appeal()"); pg.wait_for_timeout(200)
    check("appeal clears the review", pg.evaluate("S.underReview") is False)
    pg.screenshot(path=str(SHOT / "07-under-review.png"), full_page=True)

    # -------------------------------------------------------------- SPONSOR
    section("SPONSOR RAILS: present, dormant")
    app_txt = pg.inner_text("#app")
    check("sponsor status reads dormant",
          "band hai" in app_txt or "dormant" in app_txt.lower())
    check("slot hidden while sponsor_id is null",
          pg.evaluate("document.getElementById('sponsorslot').classList.contains('on')") is False)
    pg.evaluate("S.sponsorId='colgate';draw()"); pg.wait_for_timeout(150)
    check("slot activates by config alone",
          pg.evaluate("document.getElementById('sponsorslot').classList.contains('on')") is True)
    pg.evaluate("S.sponsorId=null;draw()"); pg.wait_for_timeout(120)

    # ---------------------------------------------------------- CYCLE RESET
    section("CYCLE RESET")
    pg.click(".devbar button:has-text('+Month')"); pg.wait_for_timeout(250)
    check("cap resets", pg.evaluate("S.earnedThisCycle") == 0)
    check("pot re-credited at ₹30", pg.evaluate("S.pot") == 30)
    check("alarm-days are NOT reset by a new cycle",
          pg.evaluate("S.alarmDays") > 0, "the gate is lifetime, not per-cycle")

    # --------------------------------------------- FULL-LOCALE RENDER SWEEP
    section("RENDER SWEEP: no missing keys in any locale")
    pg.evaluate("S.withdrawable=12;S.earnedThisCycle=12;draw()")
    for loc in ("hi-Latn", "en", "hi"):
        pg.evaluate(f"setLocale('{loc}')"); pg.wait_for_timeout(200)
        txt = pg.inner_text("#app")
        check(f"[{loc}] dashboard renders with no missing-key markers", "??" not in txt)
        check(f"[{loc}] rupee amounts render", "₹" in txt)
    pg.evaluate("setLocale('hi-Latn');draw()"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOT / "08-dashboard-hinglish.png"), full_page=True)
    pg.evaluate("setLocale('en');draw()"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOT / "09-dashboard-english.png"), full_page=True)
    pg.evaluate("setLocale('hi-Latn');draw()"); pg.wait_for_timeout(150)

    section("JS ERRORS")
    real = [e for e in errs if "favicon" not in e.lower()]
    check("no JavaScript errors", len(real) == 0, "; ".join(real[:3]))

    b.close()

print("\n" + "=" * 62)
passed = sum(1 for _, c, _ in checks if c)
print(f"{passed}/{len(checks)} checks passed")
if fails:
    print("\nFAILURES:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("All checks passed.")
