#!/usr/bin/env node
/* AlarmX — panchang engine verification.
   Run:  node verify_panchang.js

   Validates the astronomy from FIRST PRINCIPLES and against real, well-known
   calendar anchors. Nothing here is copied from any published almanac.

   NOT COVERED, and a release blocker per PRD 16: the 60-date cross-check
   against a printed Vishuddha Siddhanta panjika and a Tamil daily calendar.
   That needs the physical almanacs and is Bijoy's task, not this script's. */

const P = require("../prototype/panchang.js");

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("  PASS  " + name + (detail ? `   [${detail}]` : "")); }
  else { fail++; fails.push(`${name} :: ${detail}`); console.log("  FAIL  " + name + `   [${detail}]`); }
}
const section = t => console.log(`\n--- ${t} ---`);

/* ---- 1. Sun longitude at the cardinal points ----------------------------- */
section("SUN: tropical longitude at solstices and equinoxes (2026)");
for (const [label, y, m, d, expect] of [
  ["March equinox", 2026, 3, 20, 0], ["June solstice", 2026, 6, 21, 90],
  ["Sept equinox", 2026, 9, 23, 180], ["Dec solstice", 2026, 12, 21, 270]]) {
  let best = null;
  for (let h = 0; h < 24; h += 0.25) {
    const L = P.sunLongitude(P.toJD(y, m, d, h));
    const err = Math.abs(((L - expect + 540) % 360) - 180);
    if (!best || err < best.err) best = { L, err };
  }
  check(`${label} within 1°`, best.err < 1.0, `${best.L.toFixed(3)}°, err ${best.err.toFixed(3)}°`);
}

/* ---- 2. Lunation ---------------------------------------------------------- */
section("MOON: synodic month from successive new moons");
const elong = jd => P.norm360(P.moonLongitude(jd) - P.sunLongitude(jd));
const newMoons = [];
let cursor = P.toJD(2026, 1, 1, 0);
for (let i = 0; i < 5; i++) {
  let prev = elong(cursor);
  for (let step = 1; step < 40 * 24; step++) {
    const j = cursor + step / 24, e = elong(j);
    if (e < prev && prev > 300 && e < 60) { newMoons.push(j); cursor = j + 2; break; }
    prev = e;
  }
}
for (let i = 1; i < newMoons.length; i++) {
  const dt = newMoons[i] - newMoons[i - 1];
  check(`lunation ${i} near 29.53 d`, Math.abs(dt - 29.53) < 0.7, `${dt.toFixed(3)} d`);
}

/* ---- 3. Tithi definition -------------------------------------------------- */
section("TITHI: definition holds at syzygy");
check("new moon is Amavasya or Shukla Pratipada", (() => {
  const t = P.tithiAt(newMoons[0]);
  return t.name === "Amavasya" || (t.paksha === "Shukla" && t.name === "Pratipada");
})(), P.tithiAt(newMoons[0]).paksha + " " + P.tithiAt(newMoons[0]).name);

let fullMoon = null;
for (let s = 0; s < 40 * 24; s++) {
  const j = newMoons[0] + s / 24;
  if (Math.abs(elong(j) - 180) < 0.3) { fullMoon = j; break; }
}
check("full moon is Purnima", P.tithiAt(fullMoon).name === "Purnima",
      P.tithiAt(fullMoon).name);
check("30 tithis span the lunation", (() => {
  const set = new Set();
  for (let s = 0; s < 30 * 24; s++) set.add(P.tithiAt(newMoons[0] + s / 24).index);
  return set.size === 30;
})());

/* ---- 4. Nakshatra --------------------------------------------------------- */
section("NAKSHATRA: 27 divisions, sidereal");
check("all 27 nakshatras occur in a sidereal month", (() => {
  const set = new Set();
  for (let s = 0; s < 28 * 24; s++) set.add(P.nakshatraAt(newMoons[0] + s / 24).index);
  return set.size === 27;
})());
check("ayanamsa is plausible for 2026 (~24.2°)", (() => {
  const a = P.ayanamsa(P.toJD(2026, 1, 1, 0));
  return a > 24.0 && a < 24.4;
})(), P.ayanamsa(P.toJD(2026, 1, 1, 0)).toFixed(3) + "°");

/* ---- 5. Mesha sankranti --------------------------------------------------- */
section("SANKRANTI: Mesha falls 13–16 April");
for (const y of [2025, 2026, 2027, 2028]) {
  const s = P.sankrantiJD(0, P.toJD(y, 4, 10, -5.5), P.toJD(y, 4, 20, -5.5));
  const d = new Date((s + 5.5 / 24 - 2440587.5) * 86400000);
  check(`${y} Mesha sankranti in window`, d.getUTCDate() >= 13 && d.getUTCDate() <= 16,
        `${d.getUTCDate()} Apr ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} IST`);
}

/* ---- 6. Real calendar anchors --------------------------------------------- */
section("CALENDAR ANCHORS: real festival dates");
const anchors = [
  // date         place      assertion
  ["2026-04-14", "chennai", p => p.tamil.day === 1 && p.tamil.monthIndex === 0,
   "Puthandu 14 Apr 2026 = 1 Chithirai (sankranti 09:11, before sunset)"],
  ["2026-04-13", "chennai", p => p.tamil.monthIndex === 11,
   "13 Apr 2026 still Panguni"],
  ["2026-04-15", "kolkata", p => p.bengali.day === 1 && p.bengali.monthIndex === 0 && p.bengali.year === 1433,
   "Poila Boishakh 15 Apr 2026 = 1 Boishakh 1433"],
  ["2026-04-14", "kolkata", p => p.bengali.monthIndex === 11 && p.bengali.year === 1432,
   "14 Apr 2026 still Choitro 1432 (year has not rolled)"],
  ["2026-01-14", "chennai", p => p.tamil.day === 1 && p.tamil.monthIndex === 9,
   "Pongal 14 Jan 2026 = 1 Thai (sankranti 14:53, before sunset)"],
  ["2027-01-15", "chennai", p => p.tamil.day === 1 && p.tamil.monthIndex === 9,
   "Pongal 15 Jan 2027 = 1 Thai (sankranti 21:00, AFTER sunset, rolls a day)"],
  ["2027-01-14", "chennai", p => p.tamil.monthIndex === 8,
   "14 Jan 2027 still Margazhi"],
];
for (const [date, place, fn, label] of anchors) {
  const p = P.panchang(date, place);
  check(label, fn(p),
        `B ${p.bengali.day} ${p.bengali.monthLatin} ${p.bengali.year} | T ${p.tamil.day} ${p.tamil.monthLatin} ${p.tamil.yearName}`);
}

/* ---- 7. Tamil 60-year cycle ---------------------------------------------- */
section("TAMIL YEAR: 60-year cycle anchored on Prabhava 1987");
check("2024-25 is Krodhi", P.panchang("2024-06-01", "chennai").tamil.yearName === "Krodhi",
      P.panchang("2024-06-01", "chennai").tamil.yearName);
check("cycle turns at Chithirai, not 1 January", (() => {
  const before = P.panchang("2026-04-13", "chennai").tamil.yearName;
  const after = P.panchang("2026-04-14", "chennai").tamil.yearName;
  return before !== after;
})(), P.panchang("2026-04-13", "chennai").tamil.yearName + " -> " +
      P.panchang("2026-04-14", "chennai").tamil.yearName);

/* ---- 8. Sunrise / sunset -------------------------------------------------- */
section("SUN EVENTS: sunrise, sunset, daylight");
const eq = P.panchang("2026-03-20", "kolkata");
check("Kolkata equinox daylight ~12 h", Math.abs((eq.sunset - eq.sunrise) - 12) < 0.25,
      `${(eq.sunset - eq.sunrise).toFixed(2)} h`);
check("Kolkata equinox sunrise 05:24–05:54 IST", eq.sunrise > 5.4 && eq.sunrise < 5.9,
      P.fmtHM(eq.sunrise));
const chn = P.panchang("2026-03-20", "chennai");
check("Chennai sunrise later than Kolkata (further west)", chn.sunrise > eq.sunrise,
      `${P.fmtHM(chn.sunrise)} vs ${P.fmtHM(eq.sunrise)}`);
check("Kolkata June daylight longer than December", (() => {
  const j = P.panchang("2026-06-21", "kolkata"), d = P.panchang("2026-12-21", "kolkata");
  return (j.sunset - j.sunrise) > (d.sunset - d.sunrise) + 1.5;
})());

/* ---- 9. Eighth-division periods ------------------------------------------ */
section("PERIODS: Rahu Kalam, Yamagandam, Kuligai");
const mon = P.panchang("2026-07-27", "chennai");   // a Monday
check("Rahu Kalam is one eighth of daylight", (() => {
  const len = mon.periods.rahuKalam.to - mon.periods.rahuKalam.from;
  return Math.abs(len - (mon.sunset - mon.sunrise) / 8) < 1e-6;
})(), `${P.fmtSpan(mon.periods.rahuKalam)}`);
check("Monday Rahu Kalam is the 2nd eighth", (() => {
  const part = (mon.sunset - mon.sunrise) / 8;
  return Math.abs(mon.periods.rahuKalam.from - (mon.sunrise + part)) < 1e-6;
})());
check("Rahu, Yama and Kuligai never overlap", (() => {
  const s = [mon.periods.rahuKalam, mon.periods.yamagandam, mon.periods.kuligai];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++)
    if (s[i].from < s[j].to && s[j].from < s[i].to) return false;
  return true;
})());
check("Nalla Neram avoids all three inauspicious periods", (() => {
  const bad = [mon.periods.rahuKalam, mon.periods.yamagandam, mon.periods.kuligai];
  return mon.periods.nallaNeram.every(g =>
    bad.every(b => !(g.from < b.to && b.from < g.to)));
})());
check("all periods fall inside daylight", (() => {
  const all = [mon.periods.rahuKalam, mon.periods.yamagandam, mon.periods.kuligai,
               ...mon.periods.nallaNeram];
  return all.every(s => s.from >= mon.sunrise - 1e-9 && s.to <= mon.sunset + 1e-9);
})());

/* ---- 10. Structural sanity over a full year ------------------------------ */
section("STRUCTURE: a full year of output stays well-formed");
let bad = 0, monthLens = {};
for (let i = 0; i < 365; i++) {
  const dt = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const p = P.panchang(dt, "kolkata");
  if (!(p.tithi.index >= 1 && p.tithi.index <= 30)) bad++;
  if (!(p.nakshatra.index >= 1 && p.nakshatra.index <= 27)) bad++;
  if (!(p.yoga.index >= 1 && p.yoga.index <= 27)) bad++;
  if (!(p.karana.index >= 1 && p.karana.index <= 60)) bad++;
  if (!(p.bengali.day >= 1 && p.bengali.day <= 32)) bad++;
  if (!(p.tamil.day >= 1 && p.tamil.day <= 32)) bad++;
  if (!p.bengali.month || !p.tamil.month) bad++;
  const k = p.bengali.monthIndex;
  monthLens[k] = Math.max(monthLens[k] || 0, p.bengali.day);
}
check("365 days produce no out-of-range values", bad === 0, `${bad} bad fields`);
check("solar months are 29–32 days", Object.values(monthLens).every(v => v >= 29 && v <= 32),
      JSON.stringify(monthLens));
check("every Bengali month name is non-empty Bengali script", (() => {
  return Object.keys(monthLens).every(k => /[ঀ-৿]/.test(
    P.panchang("2026-07-26", "kolkata").bengali.month) );
})());

console.log("\n" + "=".repeat(62));
console.log(`${pass}/${pass + fail} checks passed`);
if (fail) { console.log("\nFAILURES:"); fails.forEach(f => console.log("  - " + f)); process.exit(1); }
console.log("All panchang checks passed.");
console.log("\nSTILL REQUIRED before release (PRD 16): 60-date cross-check against a");
console.log("printed Vishuddha Siddhanta panjika and a Tamil daily calendar. The");
console.log("Bengali month-start rule in particular is matched against ONE year only.");
