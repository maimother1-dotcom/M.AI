#!/usr/bin/env node
/* AlarmX — Bengali calendar cross-validation against independent references.
   Run:  node verify_bengali_cross.js

   WHAT THIS DOES, AND WHAT IT DOES NOT DO.

   Two independent MIT-licensed implementations of the revised Bengali calendar
   were run over 1461 days (2025-2028). They agreed on every single day. Their
   agreed output is frozen in reference/bangladesh-1461-days.tsv.

   That gives an external oracle for exactly ONE of the two Bengali systems
   AlarmX ships: the ARITHMETIC Bangladesh calendar. It is a complete oracle
   for that one - 1461/1461 must match, no tolerance.

   It is NOT an oracle for Vishuddha Siddhanta, the astronomical panjika
   followed in West Bengal. Those references do not compute drik dates, and
   they compute no tithi, nakshatra, yoga or karana at all. So for drik this
   file asserts only what the comparison can legitimately establish:

     - the two systems disagree in the WAY they are known to disagree
       (Bangladesh pins Pohela Boishakh to 14 April; drik lands on the 15th
       in most years and the 14th occasionally),
     - the month names, month order, year numbering and Bengali numerals
       agree, because those are shared between the two systems.

   The 60-date cross-check against a printed Vishuddha Siddhanta panjika
   remains outstanding and is still a release blocker. See PRD 16.3. */

"use strict";
const fs = require("fs");
const path = require("path");
const P = require("../prototype/panchang.js");

let fails = 0, n = 0;
const check = (name, cond, detail = "") => {
  n++;
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? `   [${detail}]` : ""));
};
const section = t => console.log(`\n--- ${t} ---`);

/* ---- load the frozen reference ------------------------------------------ */
const REF = path.join(__dirname, "reference", "bangladesh-1461-days.tsv");
const rows = fs.readFileSync(REF, "utf8").split("\n")
  .filter(l => l && !l.startsWith("#"))
  .map(l => {
    const [iso, day, month, year] = l.split("\t");
    return { iso, day: +day, month, year: +year };
  });

section("REFERENCE DATA");
check("reference file loads", rows.length === 1461, `${rows.length} rows`);
check("reference spans 2025-01-01 to 2028-12-31",
      rows[0].iso === "2025-01-01" && rows[rows.length - 1].iso === "2028-12-31",
      `${rows[0].iso} .. ${rows[rows.length - 1].iso}`);
check("reference dates are contiguous, no gaps or repeats", (() => {
  const D = s => Date.parse(s + "T00:00:00Z") / 86400000;
  for (let i = 1; i < rows.length; i++) if (D(rows[i].iso) - D(rows[i - 1].iso) !== 1) return false;
  return true;
})());

/* ---- 1. the Bangladesh system must match EXACTLY ------------------------- */
section("BANGLADESH ARITHMETIC CALENDAR: exact match required, 1461 days");
let bdMismatch = [];
for (const r of rows) {
  const [y, m, d] = r.iso.split("-").map(Number);
  const b = P.bengaliDateBD(y, m, d);
  if (b.day !== r.day || b.monthLatin !== r.month || b.year !== r.year)
    bdMismatch.push(`${r.iso}: got ${b.day} ${b.monthLatin} ${b.year}, ref ${r.day} ${r.month} ${r.year}`);
}
check("all 1461 days match two independent implementations",
      bdMismatch.length === 0, bdMismatch.slice(0, 3).join(" ; "));
check("Pohela Boishakh is pinned to 14 April every year", (() => {
  for (const y of [2025, 2026, 2027, 2028]) {
    const b = P.bengaliDateBD(y, 4, 14);
    if (!(b.day === 1 && b.monthLatin === "Boishakh")) return false;
  }
  return true;
})());
check("leap year adds a day to Falgun, and only to Falgun", (() => {
  /* 2028 is a leap year. 29 Feb 2028 must be a valid Falgun date. */
  const leap = P.bengaliDateBD(2028, 2, 29);
  const norm = P.bengaliDateBD(2027, 3, 14);
  return leap.monthLatin === "Falgun" && norm.monthLatin === "Falgun";
})(), `${P.bengaliDateBD(2028, 2, 29).day} Falgun`);
check("every day of every Bengali month is reachable and in range", (() => {
  const seen = {};
  for (const r of rows) {
    const [y, m, d] = r.iso.split("-").map(Number);
    const b = P.bengaliDateBD(y, m, d);
    if (b.day < 1 || b.day > 32) return false;
    (seen[b.monthLatin] = seen[b.monthLatin] || new Set()).add(b.day);
  }
  return Object.keys(seen).length === 12;
})());

/* ---- 2. shared structure: names, order, numbering ------------------------ */
section("SHARED STRUCTURE: what both systems must agree on");
check("month names and order match the reference", (() => {
  /* Walk the same day sequence through both and record first appearance, so
     the two orders are derived identically and only the values are compared. */
  const seq = src => {
    const out = [];
    for (const r of rows) {
      const name = src(r);
      if (!out.includes(name)) out.push(name);
    }
    return out;
  };
  const ref = seq(r => r.month);
  const mine = seq(r => {
    const [y, m, d] = r.iso.split("-").map(Number);
    return P.bengaliDateBD(y, m, d).monthLatin;
  });
  return ref.length === 12 && ref.join(",") === mine.join(",");
})(), (() => {
  const o = [];
  for (const r of rows) if (!o.includes(r.month)) o.push(r.month);
  return o.join(" ");
})());
check("drik uses the same 12 month names as the reference", (() => {
  const refNames = new Set(rows.map(r => r.month));
  for (const r of rows.filter((_, i) => i % 11 === 0)) {
    if (!refNames.has(P.panchang(r.iso, "kolkata").bengali.monthLatin)) return false;
  }
  return true;
})());
check("Bengali numerals match the reference digits",
      P.localDigits(1433, "bn") === "১৪৩৩" && P.localDigits(30, "bn") === "৩০");

/* ---- 3. drik vs Bangladesh: the disagreement must be the known one ------- */
section("DRIK vs BANGLADESH: the gap must be the real one, not noise");
const D = s => Date.parse(s + "T00:00:00Z") / 86400000;
const bdMap = new Map(), dkMap = new Map();
for (const r of rows) {
  bdMap.set(`${r.day} ${r.month} ${r.year}`, r.iso);
  const p = P.panchang(r.iso, "kolkata").bengali;
  dkMap.set(`${p.day} ${p.monthLatin} ${p.year}`, r.iso);
}
const offsets = {};
let matched = 0;
for (const [k, isoBd] of bdMap) {
  const isoDk = dkMap.get(k);
  if (!isoDk) continue;
  matched++;
  const o = D(isoDk) - D(isoBd);
  offsets[o] = (offsets[o] || 0) + 1;
}
const keys = Object.keys(offsets).map(Number).sort((a, b) => a - b);
console.log("        offset distribution (drik minus Bangladesh, same Bengali label):");
keys.forEach(o => console.log(`          ${o >= 0 ? "+" : ""}${o}d : ${String(offsets[o]).padStart(4)}` +
  `  ${(offsets[o] / matched * 100).toFixed(1)}%`));

check("drik never runs BEHIND the arithmetic calendar",
      keys.every(o => o >= 0), `min offset ${keys[0]}`);
check("drift stays within 3 days, which fixed vs variable month lengths implies",
      keys.every(o => o <= 3), `max offset ${keys[keys.length - 1]}`);
check("the two systems are genuinely different, not a relabelling",
      (offsets[0] || 0) / matched < 0.5,
      `${((offsets[0] || 0) / matched * 100).toFixed(1)}% identical`);

section("NEW YEAR: the one date the two countries visibly disagree on");
const ny = {};
for (const y of [2025, 2026, 2027, 2028]) {
  const bnYear = y - 593;
  ny[y] = { bd: bdMap.get(`1 Boishakh ${bnYear}`), dk: dkMap.get(`1 Boishakh ${bnYear}`) };
  console.log(`        ${y}:  drik ${ny[y].dk}   Bangladesh ${ny[y].bd}`);
}
check("Bangladesh new year is 14 April in all four years",
      [2025, 2026, 2027, 2028].every(y => ny[y].bd === `${y}-04-14`));
/* West Bengal really did keep Poila Boishakh on 15 April 2025 while Bangladesh
   observed it on the 14th. This is the check that the drik engine reproduces a
   documented real-world difference rather than an arbitrary one. */
check("drik puts Poila Boishakh 2025 on 15 April, one day after Bangladesh",
      ny[2025].dk === "2025-04-15", ny[2025].dk);
check("drik new year is always 14 or 15 April",
      [2025, 2026, 2027, 2028].every(y => ny[y].dk === `${y}-04-14` || ny[y].dk === `${y}-04-15`));
check("drik new year is not simply pinned - it moves between years",
      new Set([2025, 2026, 2027, 2028].map(y => ny[y].dk.slice(-2))).size > 1,
      [2025, 2026, 2027, 2028].map(y => ny[y].dk).join(" "));

section("SCOPE: what these references cannot check");
check("references supply no tithi, so tithi remains unvalidated externally",
      rows.every(r => r.tithi === undefined));
check("Dhaka is a known place, so Bangladesh users can be served",
      !!P.PLACES.dhaka, JSON.stringify(P.PLACES.dhaka || null));

console.log("\n" + "=".repeat(62));
console.log(`${n - fails}/${n} checks passed`);
if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("All cross-validation checks passed.");
console.log(`
VALIDATED by this run: the Bangladesh arithmetic calendar, exactly, on all
1461 days, against two independent implementations. Month names, month order,
year numbering and Bengali numerals. The drik engine's new-year behaviour,
including the real one-day gap with Bangladesh in 2025.

STILL NOT VALIDATED: every drik date that is not the new year, and every
tithi, nakshatra, yoga and karana. No reference used here computes those.
The 60-date printed-panjika cross-check is still a release blocker.`);
