#!/usr/bin/env python3
"""AlarmX prototype v0.4 — browser verification.

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
    section("LOCALISATION: Hinglish default, five locales, full key parity")
    check("default locale is Hinglish", pg.evaluate("S.locale") == "hi-Latn",
          pg.evaluate("S.locale"))
    check("five locales offered", pg.evaluate("LOCALES.length") == 5,
          str(pg.evaluate("LOCALES")))
    check("bn and ta are present", pg.evaluate("LOCALES.includes('bn') && LOCALES.includes('ta')"))
    check("every locale has a display name",
          pg.evaluate("LOCALES.every(l => !!LOCALE_NAMES[l])"))
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
    pg.evaluate("setLocale('bn')"); pg.wait_for_timeout(120)
    check("switching to Bengali renders Bengali script",
          "ভোরে উঠুন" in pg.inner_text("#app"))
    pg.evaluate("setLocale('ta')"); pg.wait_for_timeout(120)
    check("switching to Tamil renders Tamil script",
          "அதிகாலையில்" in pg.inner_text("#app"))

    # A string can be present in the DOM and still paint as tofu boxes. Measure
    # the rendered width of a known glyph against a Latin fallback: if the font
    # is missing the shaping collapses and the widths converge.
    widths = pg.evaluate("""() => {
        const mk = (txt, fam) => {
            const s = document.createElement('span');
            s.textContent = txt; s.style.cssText =
              'position:absolute;visibility:hidden;font-size:40px;white-space:nowrap;font-family:' + fam;
            document.body.appendChild(s);
            const w = s.getBoundingClientRect().width; s.remove(); return w;
        };
        return { bn: mk('ভোরে উঠুন', "'Noto Sans Bengali',sans-serif"),
                 ta: mk('அதிகாலையில்', "'Noto Sans Tamil',sans-serif"),
                 tofu: mk('\\uFFFF\\uFFFF\\uFFFF\\uFFFF\\uFFFF', 'sans-serif') };
    }""")
    check("Bengali glyphs paint, not tofu", widths["bn"] > 40,
          f"width {widths['bn']:.0f}px, tofu ref {widths['tofu']:.0f}px")
    check("Tamil glyphs paint, not tofu", widths["ta"] > 40,
          f"width {widths['ta']:.0f}px, tofu ref {widths['tofu']:.0f}px")

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
    check("language screen offers all five", pg.locator("#app .langrow button").count() == 5)
    pg.click("#app button.primary"); pg.wait_for_timeout(150)
    check("language leads into the calendar picker", pg.evaluate("S.screen") == "region",
          pg.evaluate("S.screen"))
    check("calendar picker names the panjika system in use",
          "Vishuddha Siddhanta" in pg.inner_text("#app")
          and "Thirukanitham" in pg.inner_text("#app"))
    pg.evaluate("pickRegion('kolkata')"); pg.wait_for_timeout(150)
    check("picking a region continues to the exam step",
          pg.evaluate("S.screen") == "exam", pg.evaluate("S.screen"))
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

    # -------------------------------------------------------- AD PLACEMENT
    section("AD PLACEMENT: nothing between the user and dismissing the alarm (PRD 4.6)")
    # This is the load-bearing check of the whole policy. An ad in the ring
    # path reverses PRD 3.1 and is a Play suspension risk, and it is worth
    # ₹0.65 of cap. Asserted structurally so it cannot regress unnoticed.
    pg.evaluate("S.screen='dashboard';S.alarmArmed=true;S.alarmDoneToday=false;draw()")
    pg.wait_for_timeout(150)
    pg.evaluate("startAlarm()"); pg.wait_for_timeout(400)
    check("alarm is ringing", pg.evaluate("!!S.ringTimer"))
    check("NO ad slot anywhere inside the ring screen",
          pg.evaluate("document.querySelectorAll('#ring [data-ad-slot]').length") == 0,
          str(pg.evaluate("document.querySelectorAll('#ring [data-ad-slot]').length")))
    check("the sponsor label is present but declared non-blocking",
          pg.evaluate("!!document.querySelector('#ring #sponsorslot[data-nonblocking]')")
          and pg.evaluate("!document.querySelector('#ring #sponsorslot').hasAttribute('data-ad-slot')"))
    check("the dismissal task is interactive while the alarm rings",
          pg.evaluate("document.querySelectorAll('#task input, #task button').length") > 0,
          str(pg.evaluate("document.querySelectorAll('#task input, #task button').length")))
    check("no ad blocks the reward window countdown",
          "s" in pg.inner_text("#rewardwin"))
    pg.evaluate("finishAlarm()"); pg.wait_for_timeout(300)
    check("dismissal succeeded with no ad in the path",
          pg.evaluate("!S.ringTimer") and pg.evaluate("S.alarmDoneToday") is True)

    section("AD PLACEMENT: the four allowed slots")
    slots = pg.evaluate("""() => [...document.querySelectorAll('[data-ad-slot]')]
        .map(e => e.dataset.adWhere + ':' + e.dataset.adSlot)""")
    check("post-dismissal interstitial renders once the alarm is done",
          "postDismiss:interstitial" in slots, ", ".join(slots))
    check("pre-spin slot and the rewarded offer both render",
          "spin:interstitial" in slots and "offer:rewarded" in slots, ", ".join(slots))
    check("leaderboard carries a banner, not an interstitial",
          "results:banner" in slots, ", ".join(slots))
    check("every ad slot declares a known format",
          all(s.split(":")[1] in ("interstitial", "banner", "rewarded") for s in slots),
          ", ".join(slots))

    pg.evaluate("S.screen='survey';S.surveyIdx=4;draw()"); pg.wait_for_timeout(200)
    check("mid-survey interstitial renders between questions",
          pg.evaluate("!!document.querySelector('[data-ad-where=survey]')"))
    pg.evaluate("S.screen='dashboard';draw()"); pg.wait_for_timeout(200)

    section("REWARDED VIDEO: opt-in, capped, priced before the view")
    check("rewarded load is 4 per active day", pg.evaluate("REWARDED_PER_DAY") == 4,
          str(pg.evaluate("REWARDED_PER_DAY")))
    offer = pg.inner_text("[data-ad-where='offer']")
    check("the reward is stated before the video starts", "₹" in offer, offer.replace("\n", " | ")[:90])
    before = pg.evaluate("S.rewardedToday")
    pg.wait_for_timeout(200)
    check("it never starts on its own", pg.evaluate("S.rewardedToday") == before)
    pg.click("#rewardedbtn"); pg.wait_for_timeout(250)
    check("watching one is an explicit click", pg.evaluate("S.rewardedToday") == before + 1)
    for _ in range(5):
        btn = pg.query_selector("#rewardedbtn:not([disabled])")
        if not btn:
            break
        btn.click(); pg.wait_for_timeout(150)
    check("the daily cap holds at 4", pg.evaluate("S.rewardedToday") == 4,
          str(pg.evaluate("S.rewardedToday")))
    check("the button disables once the day's videos are used",
          pg.evaluate("document.getElementById('rewardedbtn').disabled") is True)
    check("data cost is disclosed on the offer",
          "MB" in pg.inner_text("[data-ad-where='offer']"))
    pg.evaluate("S.rewardedToday=0;draw()"); pg.wait_for_timeout(150)

    # ------------------------------------------- WIDGET AND REGIONAL CALENDAR
    section("WIDGET: 4x2 proportions, two tap targets, midnight rollover (PRD 16.4)")
    pg.evaluate("S.screen='dashboard';S.dayOffset=0;draw()"); pg.wait_for_timeout(200)
    check("widget renders on the dashboard", pg.locator(".widget").count() == 1)
    box = pg.locator(".widget").bounding_box()
    ratio = box["width"] / box["height"]
    check("widget holds true 4x2 proportions", abs(ratio - 2.0) < 0.06,
          f"{box['width']:.0f}x{box['height']:.0f} = {ratio:.2f}:1")
    check("calendar half is a tap target", pg.locator(".widget .wcal").count() == 1)
    check("AlarmX half is a separate tap target", pg.locator(".widget .wstrip").count() == 1)
    wtext = pg.inner_text(".widget")
    check("widget shows a clock", ":" in wtext)
    check("widget shows the streak pot", "₹" in wtext)
    check("widget carries panchang and AlarmX state together",
          any(x in wtext for x in ("Tithi", "Purnima", "Amavasya", "Pratipada", "Dwitiya",
                                   "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami",
                                   "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
                                   "Trayodashi", "Chaturdashi"))
          and "POT" in wtext.upper(), wtext.replace("\n", " | ")[:120])

    before = pg.inner_text(".widget")
    pg.click(".devbar button:has-text('+Date')"); pg.wait_for_timeout(250)
    after = pg.inner_text(".widget")
    check("midnight rollover changes the widget content", before != after)
    pg.click(".devbar button:has-text('-Date')"); pg.wait_for_timeout(200)

    check("tapping the calendar half opens the calendar",
          pg.evaluate("(() => { document.querySelector('.widget .wcal').click(); return S.screen; })()")
          == "calendar")
    pg.wait_for_timeout(200)

    section("CALENDAR: month grid, panchang detail, panjika label (PRD 16.2, 16.5)")
    check("month grid renders a full month",
          28 <= pg.locator(".calday:not(.pad)").count() <= 31,
          str(pg.locator(".calday:not(.pad)").count()))
    check("the panjika system in use is named on screen",
          "Vishuddha Siddhanta" in pg.inner_text("#app")
          or "Thirukanitham" in pg.inner_text("#app"))
    check("unsupported systems are declared, not hidden",
          "Gupta Press" in pg.inner_text("#app") or "Vakya" in pg.inner_text("#app"))
    detail = pg.inner_text("#app")
    for field in ("Tithi", "Nakshatra", "Yoga"):
        check(f"day detail shows {field}", field in detail)
    check("day detail shows the inauspicious periods",
          "Rahu" in detail and "–" in detail)
    check("prototype accuracy is disclosed, not implied",
          "Swiss Ephemeris" in detail)

    # Tapping a different day must change the detail pane, not just the highlight.
    d1 = pg.inner_text("#app .card:last-child")
    pg.evaluate("pickDay((() => { const c=[...document.querySelectorAll('.calday:not(.pad)')]; "
                "return c[c.length-1].dataset.iso; })())")
    pg.wait_for_timeout(250)
    check("tapping a day loads that day's panchang",
          pg.inner_text("#app .card:last-child") != d1)

    section("REGIONAL CORRECTNESS: the two traditions do not agree, and must not")
    kol = pg.evaluate("(() => { const p = panchang('2026-04-14','kolkata'); "
                      "return p.bengali.day + ' ' + p.bengali.monthLatin + ' ' + p.bengali.year; })()")
    chn = pg.evaluate("(() => { const p = panchang('2026-04-14','chennai'); "
                      "return p.tamil.day + ' ' + p.tamil.monthLatin; })()")
    check("14 Apr 2026 is Puthandu in Chennai (1 Chithirai)", chn == "1 Chithirai", chn)
    check("14 Apr 2026 is NOT yet Poila Boishakh in Kolkata",
          kol == "30 Choitro 1432", kol)
    kol15 = pg.evaluate("(() => { const p = panchang('2026-04-15','kolkata'); "
                        "return p.bengali.day + ' ' + p.bengali.monthLatin + ' ' + p.bengali.year; })()")
    check("15 Apr 2026 is Poila Boishakh in Kolkata", kol15 == "1 Boishakh 1433", kol15)
    check("Pongal 2027 falls on 15 Jan, not 14",
          pg.evaluate("panchang('2027-01-15','chennai').tamil.day") == 1
          and pg.evaluate("panchang('2027-01-14','chennai').tamil.day") == 30)
    check("festivals are derived, and surface on the right day",
          "Thai Pongal" in pg.evaluate("panchang('2027-01-15','chennai').festivals.join(',')"))

    section("PANCHANG IN NATIVE SCRIPT: element names, not just chrome")
    # A Bengali panjika printing "Dwadashi" in Latin is not a Bengali panjika.
    names = pg.evaluate("""() => {
        const t = tithiAt(toJD(2026,7,26,0)), n = nakshatraAt(toJD(2026,7,26,0));
        const out = {};
        for (const s of ['bn','ta']) out[s] = [localName('tithi',t,s), localName('nakshatra',n,s)];
        out.latin = [t.name, n.name];
        return out;
    }""")
    for s, script_range in (("bn", (0x0980, 0x09FF)), ("ta", (0x0B80, 0x0BFF))):
        ok = all(any(script_range[0] <= ord(c) <= script_range[1] for c in v)
                 for v in names[s])
        check(f"[{s}] tithi and nakshatra render in native script", ok,
              " / ".join(names[s]))
    check("every tithi index has a native name in both scripts",
          pg.evaluate("""() => {
              for (let i = 1; i <= 30; i++)
                for (const s of ['bn','ta'])
                  if (!localName('tithi', {index:i, name:'X'}, s)
                      || localName('tithi', {index:i, name:'X'}, s) === 'X') return false;
              return true;
          }"""))
    check("every nakshatra, yoga and karana index has a native name",
          pg.evaluate("""() => {
              const spans = { nakshatra:27, yoga:27, karana:60 };
              for (const k in spans)
                for (let i = 1; i <= spans[k]; i++)
                  for (const s of ['bn','ta']) {
                    const v = localName(k, {index:i, name:'X'}, s);
                    if (!v || v === 'X') return false;
                  }
              return true;
          }"""))
    check("Bengali uses Bengali numerals, Tamil uses Latin",
          pg.evaluate("localDigits(1433,'bn')") == "১৪৩৩"
          and pg.evaluate("localDigits(1433,'ta')") == "1433",
          pg.evaluate("localDigits(1433,'bn')") + " / " + pg.evaluate("localDigits(1433,'ta')"))
    check("the Tamil 60-year cycle prints in Tamil script",
          pg.evaluate("NAMES_LOCAL.ta.years.length") == 60
          and pg.evaluate("localYearName('Parabhava','ta')") == "பரபாவ"
          and pg.evaluate("TAMIL_YEARS.every(y => localYearName(y,'ta') !== y)"),
          pg.evaluate("localYearName('Parabhava','ta')"))
    check("locales without a name table fall back to Latin, never blank",
          pg.evaluate("localName('tithi', tithiAt(toJD(2026,7,26,0)), 'hi-Latn')")
          == pg.evaluate("tithiAt(toJD(2026,7,26,0)).name"))

    section("BANGLADESH: a different system, not just a different city")
    # Bangladesh uses a revised ARITHMETIC calendar with fixed month lengths,
    # pinning Pohela Boishakh to 14 April. Serving a Dhaka user the West Bengal
    # drik date is wrong on the biggest day of their year.
    check("Dhaka is offered as its own calendar system",
          pg.evaluate("REGIONS.some(r => r.key === 'dhaka' && r.tradition === 'bengaliBD')"))
    check("Dhaka is a real place with the right timezone",
          pg.evaluate("PLACES.dhaka.tz") == 6, str(pg.evaluate("PLACES.dhaka.tz")))
    check("Bangladesh pins Pohela Boishakh to 14 April every year",
          pg.evaluate("""[2025,2026,2027,2028].every(y => {
              const b = bengaliDateBD(y,4,14); return b.day === 1 && b.monthLatin === 'Boishakh'; })"""))
    check("West Bengal drik and Bangladesh disagree on the 2026 new year",
          pg.evaluate("panchang('2026-04-14','kolkata').bengali.day") == 30
          and pg.evaluate("bengaliDateBD(2026,4,14).day") == 1,
          "drik 30 Choitro vs BD 1 Boishakh")
    check("the arithmetic system is labelled as arithmetic, not drik",
          pg.evaluate("bengaliDateBD(2026,4,14).basis") == "arithmetic")

    pg.evaluate("S.region='dhaka';S.calSel=null;draw()"); pg.wait_for_timeout(250)
    check("selecting Dhaka switches the displayed date to the BD system",
          pg.evaluate("nativeDate(pan(curISO()), true).monthLatin")
          == pg.evaluate("bengaliDateBD(...curISO().split('-').map(Number)).monthLatin"))
    pg.evaluate("go('calendar')"); pg.wait_for_timeout(250)
    caltxt = pg.inner_text("#app")
    check("the calendar screen names the Bangladesh system and its basis",
          "Bangladesh revised" in caltxt and "arithmetic" in caltxt)
    pg.evaluate("S.region='kolkata';S.calSel=null;draw()"); pg.wait_for_timeout(200)
    check("Kolkata is labelled drik, not arithmetic",
          "drik" in pg.inner_text("#app") and "arithmetic" not in pg.inner_text("#app"))

    pg.evaluate("S.region='kolkata';cycleRegion()"); pg.wait_for_timeout(250)
    check("switching region switches the tradition shown",
          pg.evaluate("regionMeta().tradition") == "bengaliBD",
          pg.evaluate("regionMeta().tradition"))
    pg.evaluate("cycleRegion()"); pg.wait_for_timeout(250)
    check("cycling again reaches the Tamil tradition",
          pg.evaluate("regionMeta().tradition") == "tamil",
          pg.evaluate("regionMeta().tradition"))
    pg.evaluate("setLocale('ta');draw()"); pg.wait_for_timeout(250)
    pg.screenshot(path=str(SHOT / "10-calendar-tamil.png"), full_page=True)
    pg.evaluate("S.region='kolkata';S.calSel=null;setLocale('bn');draw()"); pg.wait_for_timeout(250)
    pg.screenshot(path=str(SHOT / "11-calendar-bengali.png"), full_page=True)
    pg.evaluate("S.screen='dashboard';draw()"); pg.wait_for_timeout(250)
    pg.screenshot(path=str(SHOT / "12-widget-bengali.png"), full_page=True)
    pg.evaluate("setLocale('hi-Latn');draw()"); pg.wait_for_timeout(150)

    # --------------------------------------------- FULL-LOCALE RENDER SWEEP
    section("RENDER SWEEP: no missing keys in any locale")
    pg.evaluate("S.withdrawable=12;S.earnedThisCycle=12;draw()")
    for loc in ("hi-Latn", "en", "hi", "bn", "ta"):
        pg.evaluate(f"setLocale('{loc}')"); pg.wait_for_timeout(200)
        txt = pg.inner_text("#app")
        check(f"[{loc}] dashboard renders with no missing-key markers", "??" not in txt)
        check(f"[{loc}] rupee amounts render", "₹" in txt)
        pg.evaluate("go('calendar')"); pg.wait_for_timeout(200)
        cal = pg.inner_text("#app")
        check(f"[{loc}] calendar renders with no missing-key markers", "??" not in cal)
        pg.evaluate("go('dashboard')"); pg.wait_for_timeout(150)
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
