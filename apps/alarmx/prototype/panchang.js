/* AlarmX — panchang engine (PROTOTYPE ONLY)
   ============================================================================
   Computes tithi, nakshatra, yoga, karana, the eighth-division periods
   (Rahu Kalam / Yamagandam / Kuligai / Nalla Neram), sunrise/sunset, and the
   Bengali and Tamil solar calendar dates.

   ACCURACY AND SCOPE — read before trusting any output
   ----------------------------------------------------------------------------
   This is a Meeus-based approximation written so the prototype can demonstrate
   the mechanic with REAL computation instead of hardcoded fake data.

     Sun longitude   ~0.01 deg
     Moon longitude  ~0.02 deg  (truncated ELP series, 20 largest terms)
     Ayanamsa        Lahiri, linear approximation

   A 0.02 deg error in the Moon is about 3 minutes of tithi timing. That is
   fine for showing which tithi a day falls in, and NOT fine near a boundary
   that falls close to sunrise, which is exactly when people care.

   PRODUCTION USES SWISS EPHEMERIS under a commercial licence (Moshier mode,
   no data files). See PRD 16. This file must never ship to users.

   NOTHING HERE IS COPIED from bengalicalendar.com or tamildailycalendar.com.
   Their content is copyrighted and both return HTTP 403 to automated requests.
   Everything below is computed from first principles.

   System: drik / observational — i.e. Vishuddha Siddhanta (Bengali) and
   Thirukanitham (Tamil). Gupta Press and Vakya use Surya Siddhanta MEAN
   positions and are NOT an offset on these; they need their own calculator.
   ========================================================================== */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * D2R);
const cosd = x => Math.cos(x * D2R);

/* ---- Julian Day ---------------------------------------------------------- */
function toJD(y, m, d, hoursUTC = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
       + d + B - 1524.5 + hoursUTC / 24;
}
function jdFromDate(dt) {
  return toJD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(),
              dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600);
}

/* ---- Sun: apparent geocentric longitude (Meeus ch.25) -------------------- */
function sunLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M  = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
           + (0.019993 - 0.000101 * T) * sind(2 * M)
           + 0.000289 * sind(3 * M);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  return norm360(trueLong - 0.00569 - 0.00478 * sind(omega));
}

/* ---- Moon: apparent geocentric longitude (Meeus ch.47, truncated) -------- */
function moonLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;

  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2
                     + T3 / 538841 - T4 / 65194000);
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2
                     + T3 / 545868 - T4 / 113065000);
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2
                     + T3 / 69699 - T4 / 14712000);
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2
                     - T3 / 3526000 + T4 / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  // [coefficient(1e-6 deg), D, M, M', F, eccentricity power]
  const terms = [
    [6288774, 0, 0, 1, 0, 0], [1274027, 2, 0, -1, 0, 0], [ 658314, 2, 0, 0, 0, 0],
    [ 213618, 0, 0, 2, 0, 0], [-185116, 0, 1, 0, 0, 1], [-114332, 0, 0, 0, 2, 0],
    [  58793, 2, 0, -2, 0, 0], [  57066, 2, -1, -1, 0, 1], [  53322, 2, 0, 1, 0, 0],
    [  45758, 2, -1, 0, 0, 1], [ -40923, 0, 1, -1, 0, 1], [ -34720, 1, 0, 0, 0, 0],
    [ -30383, 0, 1, 1, 0, 1], [  15327, 2, 0, 0, -2, 0], [ -12528, 0, 0, 1, 2, 0],
    [  10980, 0, 0, 1, -2, 0], [  10675, 4, 0, -1, 0, 0], [  10034, 0, 0, 3, 0, 0],
    [   8548, 4, 0, -2, 0, 0], [  -7888, 2, 1, -1, 0, 1], [  -6766, 2, 1, 0, 0, 1],
    [  -5163, 1, 0, -1, 0, 0], [   4987, 1, 1, 0, 0, 1], [   4036, 2, -1, 1, 0, 1],
    [   3994, 2, 0, 2, 0, 0], [   3861, 4, 0, 0, 0, 0], [   3665, 2, 0, -3, 0, 0],
  ];
  let sum = 0;
  for (const [c, cd, cm, cmp, cf, ep] of terms) {
    const arg = cd * D + cm * M + cmp * Mp + cf * F;
    let coeff = c;
    if (ep === 1) coeff *= E;
    else if (ep === 2) coeff *= E * E;
    sum += coeff * sind(arg);
  }
  return norm360(Lp + sum / 1000000);
}

/* ---- Lahiri ayanamsa (linear approximation) ------------------------------ */
function ayanamsa(jd) {
  const years = (jd - 2451545.0) / 365.25;          // years from J2000.0
  return 23.85306 + 0.0139644 * years;              // 23d51'11" at J2000, 50.27"/yr
}
const sidereal = (tropical, jd) => norm360(tropical - ayanamsa(jd));

/* ---- Names --------------------------------------------------------------- */
const TITHI_NAMES = ["Pratipada","Dwitiya","Tritiya","Chaturthi","Panchami","Shashthi",
  "Saptami","Ashtami","Navami","Dashami","Ekadashi","Dwadashi","Trayodashi","Chaturdashi"];
const NAKSHATRA = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu",
  "Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati",
  "Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana",
  "Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
const YOGA = ["Vishkambha","Priti","Ayushman","Saubhagya","Shobhana","Atiganda","Sukarma",
  "Dhriti","Shula","Ganda","Vriddhi","Dhruva","Vyaghata","Harshana","Vajra","Siddhi",
  "Vyatipata","Variyana","Parigha","Shiva","Siddha","Sadhya","Shubha","Shukla","Brahma",
  "Indra","Vaidhriti"];
const KARANA_CYCLE = ["Bava","Balava","Kaulava","Taitila","Gara","Vanija","Vishti"];

const BENGALI_MONTHS = ["বৈশাখ","জ্যৈষ্ঠ","আষাঢ়","শ্রাবণ","ভাদ্র","আশ্বিন",
  "কার্তিক","অগ্রহায়ণ","পৌষ","মাঘ","ফাল্গুন","চৈত্র"];
const BENGALI_MONTHS_LATIN = ["Boishakh","Jyoishtho","Asharh","Shrabon","Bhadro","Ashwin",
  "Kartik","Ogrohayon","Poush","Magh","Falgun","Choitro"];
const TAMIL_MONTHS = ["சித்திரை","வைகாசி","ஆனி","ஆடி","ஆவணி","புரட்டாசி",
  "ஐப்பசி","கார்த்திகை","மார்கழி","தை","மாசி","பங்குனி"];
const TAMIL_MONTHS_LATIN = ["Chithirai","Vaikasi","Aani","Aadi","Aavani","Purattasi",
  "Aippasi","Karthigai","Margazhi","Thai","Maasi","Panguni"];
const TAMIL_YEARS = ["Prabhava","Vibhava","Shukla","Pramoda","Prajapati","Angirasa",
  "Srimukha","Bhava","Yuva","Dhatri","Ishvara","Bahudhanya","Pramathi","Vikrama","Vrisha",
  "Chitrabhanu","Svabhanu","Tarana","Parthiva","Vyaya","Sarvajit","Sarvadhari","Virodhi",
  "Vikrita","Khara","Nandana","Vijaya","Jaya","Manmatha","Durmukhi","Hevilambi","Vilambi",
  "Vikari","Sharvari","Plava","Shubhakrit","Sobhakrit","Krodhi","Vishvavasu","Parabhava",
  "Plavanga","Kilaka","Saumya","Sadharana","Virodhikrit","Paridhavi","Pramadicha","Ananda",
  "Rakshasa","Nala","Pingala","Kalayukti","Siddharthi","Raudra","Durmati","Dundubhi",
  "Rudhirodgari","Raktakshi","Krodhana","Akshaya"];

/* ---- Native-script element names ----------------------------------------- */
/* A Bengali panjika that prints "Dwadashi" in Latin inside Bengali chrome is
   not a Bengali panjika. Every element that appears on the widget or the
   detail card has a name in every script the app ships.

   Indexing: tithi 0..15 where 14 = Purnima and 15 = Amavasya, matching the
   branch in tithiAt. Karana 0..6 is the repeating cycle, then Kimstughna,
   Shakuni, Chatushpada, Naga — same order as karanaAt produces them. */
const NAMES_LOCAL = {
  bn: {
    tithi: ["প্রতিপদ","দ্বিতীয়া","তৃতীয়া","চতুর্থী","পঞ্চমী","ষষ্ঠী","সপ্তমী","অষ্টমী",
      "নবমী","দশমী","একাদশী","দ্বাদশী","ত্রয়োদশী","চতুর্দশী","পূর্ণিমা","অমাবস্যা"],
    paksha: { Shukla: "শুক্লপক্ষ", Krishna: "কৃষ্ণপক্ষ" },
    nakshatra: ["অশ্বিনী","ভরণী","কৃত্তিকা","রোহিণী","মৃগশিরা","আর্দ্রা","পুনর্বসু","পুষ্যা",
      "অশ্লেষা","মঘা","পূর্বফাল্গুনী","উত্তরফাল্গুনী","হস্তা","চিত্রা","স্বাতী","বিশাখা",
      "অনুরাধা","জ্যেষ্ঠা","মূলা","পূর্বাষাঢ়া","উত্তরাষাঢ়া","শ্রবণা","ধনিষ্ঠা","শতভিষা",
      "পূর্বভাদ্রপদ","উত্তরভাদ্রপদ","রেবতী"],
    yoga: ["বিষ্কম্ভ","প্রীতি","আয়ুষ্মান","সৌভাগ্য","শোভন","অতিগণ্ড","সুকর্মা","ধৃতি","শূল",
      "গণ্ড","বৃদ্ধি","ধ্রুব","ব্যাঘাত","হর্ষণ","বজ্র","সিদ্ধি","ব্যতীপাত","বরীয়ান","পরিঘ",
      "শিব","সিদ্ধ","সাধ্য","শুভ","শুক্ল","ব্রহ্ম","ঐন্দ্র","বৈধৃতি"],
    karana: ["বব","বালব","কৌলব","তৈতিল","গর","বণিজ","বিষ্টি",
      "কিংস্তুঘ্ন","শকুনি","চতুষ্পদ","নাগ"],
    digits: "০১২৩৪৫৬৭৮৯",
  },
  ta: {
    tithi: ["பிரதமை","துவிதியை","திருதியை","சதுர்த்தி","பஞ்சமி","சஷ்டி","சப்தமி","அஷ்டமி",
      "நவமி","தசமி","ஏகாதசி","துவாதசி","திரயோதசி","சதுர்த்தசி","பௌர்ணமி","அமாவாசை"],
    paksha: { Shukla: "வளர்பிறை", Krishna: "தேய்பிறை" },
    nakshatra: ["அசுவினி","பரணி","கார்த்திகை","ரோகிணி","மிருகசீரிடம்","திருவாதிரை","புனர்பூசம்",
      "பூசம்","ஆயில்யம்","மகம்","பூரம்","உத்திரம்","அஸ்தம்","சித்திரை","சுவாதி","விசாகம்",
      "அனுஷம்","கேட்டை","மூலம்","பூராடம்","உத்திராடம்","திருவோணம்","அவிட்டம்","சதயம்",
      "பூரட்டாதி","உத்திரட்டாதி","ரேவதி"],
    yoga: ["விஷ்கம்பம்","பிரீதி","ஆயுஷ்மான்","சௌபாக்கியம்","சோபனம்","அதிகண்டம்","சுகர்மம்",
      "திருதி","சூலம்","கண்டம்","விருத்தி","துருவம்","வியாகாதம்","ஹர்ஷணம்","வஜ்ரம்","சித்தி",
      "வியதீபாதம்","வரியான்","பரிகம்","சிவம்","சித்தம்","சாத்தியம்","சுபம்","சுக்லம்","பிரம்மம்",
      "ஐந்திரம்","வைத்ருதி"],
    karana: ["பவம்","பாலவம்","கௌலவம்","தைதுலம்","கரசை","வணிசை","விஷ்டி",
      "கிம்ஸ்துக்னம்","சகுனி","சதுஷ்பாதம்","நாகவம்"],
    digits: null,                 // Tamil daily calendars print Latin digits
    /* The 60-year cycle, same order as TAMIL_YEARS. This table is on the
       release cross-check list in PRD 16.3 alongside the tithi values — the
       cycle position is verified by test, the spellings are not. */
    years: ["பிரபவ","விபவ","சுக்ல","பிரமோதூத","பிரசோற்பத்தி","ஆங்கீரச","ஸ்ரீமுக","பவ",
      "யுவ","தாது","ஈஸ்வர","வெகுதானிய","பிரமாதி","விக்கிரம","விஷு","சித்திரபானு",
      "சுபானு","தாரண","பார்த்திப","விய","சர்வசித்து","சர்வதாரி","விரோதி","விக்ருதி",
      "கர","நந்தன","விஜய","ஜய","மன்மத","துன்முகி","ஹேவிளம்பி","விளம்பி","விகாரி",
      "சார்வரி","பிலவ","சுபகிருது","சோபகிருது","குரோதி","விசுவாசுவ","பரபாவ","பிலவங்க",
      "கீலக","சௌமிய","சாதாரண","விரோதிகிருது","பரிதாபி","பிரமாதீச","ஆனந்த","ராட்சச",
      "நள","பிங்கள","காளயுக்தி","சித்தார்த்தி","ரௌத்திரி","துன்மதி","துந்துபி",
      "ருதிரோத்காரி","ரக்தாட்சி","குரோதன","அட்சய"],
  },
};

/* Element name in the requested script, falling back to the Latin name when a
   script is not covered. Never invents a name it does not have. */
function localName(kind, obj, script) {
  const tbl = NAMES_LOCAL[script];
  if (!tbl || !obj) return obj ? obj.name : "";
  if (kind === "tithi") {
    const n = obj.index - 1, idx = n % 15;
    return tbl.tithi[idx === 14 ? (n < 15 ? 14 : 15) : idx] || obj.name;
  }
  if (kind === "karana") {
    const half = obj.index - 1;
    if (half === 0) return tbl.karana[7];
    if (half >= 57) return tbl.karana[8 + (half - 57)];
    return tbl.karana[(half - 1) % 7];
  }
  return (tbl[kind] || [])[obj.index - 1] || obj.name;
}
/* Tamil 60-year cycle name in Tamil script, by its Latin name. */
function localYearName(latin, script) {
  const tbl = NAMES_LOCAL[script];
  if (!tbl || !tbl.years) return latin;
  const i = TAMIL_YEARS.indexOf(latin);
  return i >= 0 ? tbl.years[i] : latin;
}
function localPaksha(paksha, script) {
  const tbl = NAMES_LOCAL[script];
  return (tbl && tbl.paksha[paksha]) || paksha;
}
/* Bengali panjikas print Bengali numerals. Tamil calendars do not. */
function localDigits(value, script) {
  const tbl = NAMES_LOCAL[script];
  if (!tbl || !tbl.digits) return String(value);
  return String(value).replace(/[0-9]/g, d => tbl.digits[+d]);
}

/* ---- Core elements ------------------------------------------------------- */
function tithiAt(jd) {
  const diff = norm360(moonLongitude(jd) - sunLongitude(jd));
  const n = Math.floor(diff / 12);                  // 0..29
  const paksha = n < 15 ? "Shukla" : "Krishna";
  const idx = n % 15;
  const name = idx === 14 ? (n < 15 ? "Purnima" : "Amavasya") : TITHI_NAMES[idx];
  return { index: n + 1, paksha, name, fraction: (diff % 12) / 12 };
}
function nakshatraAt(jd) {
  const lon = sidereal(moonLongitude(jd), jd);
  const n = Math.floor(lon / (360 / 27));
  return { index: n + 1, name: NAKSHATRA[n], fraction: (lon % (360 / 27)) / (360 / 27) };
}
function yogaAt(jd) {
  const s = sidereal(sunLongitude(jd), jd), m = sidereal(moonLongitude(jd), jd);
  const n = Math.floor(norm360(s + m) / (360 / 27));
  return { index: n + 1, name: YOGA[n] };
}
function karanaAt(jd) {
  const diff = norm360(moonLongitude(jd) - sunLongitude(jd));
  const half = Math.floor(diff / 6);                // 0..59
  let name;
  if (half === 0) name = "Kimstughna";
  else if (half >= 57) name = ["Shakuni", "Chatushpada", "Naga"][half - 57];
  else name = KARANA_CYCLE[(half - 1) % 7];
  return { index: half + 1, name };
}

/* ---- Sunrise / sunset (NOAA) --------------------------------------------- */
function sunEvents(y, m, d, lat, lon, tzOffsetHours) {
  const jdNoon = toJD(y, m, d, 12 - tzOffsetHours);
  const T = (jdNoon - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T);
  const M = norm360(357.52911 + 35999.05029 * T);
  const C = (1.914602 - 0.004817 * T) * sind(M) + 0.019993 * sind(2 * M);
  const lambda = L0 + C;
  const eps = 23.439291 - 0.0130042 * T;
  const decl = Math.asin(sind(eps) * sind(lambda)) * R2D;

  // equation of time (minutes)
  const y2 = Math.tan(eps / 2 * D2R) ** 2;
  const eot = 4 * R2D * (y2 * sind(2 * L0) - 2 * 0.016708 * sind(M)
            + 4 * 0.016708 * y2 * sind(M) * cosd(2 * L0)
            - 0.5 * y2 * y2 * sind(4 * L0) - 1.25 * 0.016708 ** 2 * sind(2 * M));

  const cosH = (cosd(90.833) - sind(lat) * sind(decl)) / (cosd(lat) * cosd(decl));
  if (cosH > 1) return { sunrise: null, sunset: null, polar: "night" };
  if (cosH < -1) return { sunrise: null, sunset: null, polar: "day" };
  const H = Math.acos(cosH) * R2D;

  const solarNoon = 720 - 4 * lon - eot + tzOffsetHours * 60;   // minutes local
  return { sunrise: (solarNoon - 4 * H) / 60, sunset: (solarNoon + 4 * H) / 60, polar: null };
}

/* ---- Eighth-division periods --------------------------------------------- */
/* Rahu Kalam, Yamagandam and Kuligai are the standard 1/8 daylight divisions,
   indexed by weekday. These tables are unambiguous and agree across sources.

   Nalla Neram below is DERIVED as the daylight eighths that none of the three
   inauspicious periods occupy. That is a common presentation, but the precise
   Gowri Panchangam form (Amirtha / Siddha / Labha) differs and is a validation
   item for the printed-almanac cross-check. Labelled as derived in the UI. */
const RAHU_EIGHTH  = [8, 2, 7, 5, 6, 4, 3];   // Sun..Sat, 1-indexed
const YAMA_EIGHTH  = [5, 4, 3, 2, 1, 7, 6];
const KULI_EIGHTH  = [7, 6, 5, 4, 3, 2, 1];

function eighthPeriods(sunrise, sunset, weekday) {
  if (sunrise == null || sunset == null) return null;
  const part = (sunset - sunrise) / 8;
  const span = i => ({ from: sunrise + (i - 1) * part, to: sunrise + i * part });
  const rahu = RAHU_EIGHTH[weekday], yama = YAMA_EIGHTH[weekday], kuli = KULI_EIGHTH[weekday];
  const bad = new Set([rahu, yama, kuli]);
  const good = [];
  for (let i = 1; i <= 8; i++) if (!bad.has(i)) good.push(span(i));
  return {
    rahuKalam: span(rahu), yamagandam: span(yama), kuligai: span(kuli),
    nallaNeram: [good[0], good[good.length - 1]],   // first and last clear windows
  };
}

/* ---- Bengali / Tamil solar calendar -------------------------------------- */
/* Both start months when the sun enters a sidereal sign (sankranti), and both
   begin the year at Mesha sankranti (mid-April). One engine, two name tables.

   THE TWO TRADITIONS USE DIFFERENT DAY-START RULES, and getting this wrong
   shifts every date by a day:

     Tamil (Thirukanitham) — sankranti BEFORE sunset, that civil day is day 1;
       after sunset, the next day is. Verified against three real dates:
       Puthandu 14 Apr 2026 (sankranti 09:11 IST), Pongal 14 Jan 2026 (14:53),
       Pongal 15 Jan 2027 (21:00, after sunset so it rolls to the 15th).

     Bengali (Vishuddha Siddhanta) — the month begins the day AFTER the
       sankranti. Matches Poila Boishakh 15 Apr 2025 in West Bengal
       (sankranti 14 Apr 03:05 IST).
       !! This rule is matched against ONE year only. The real Vishuddha
       Siddhanta rule has more nuance, and Bangladesh fixes Poila Boishakh to
       14 April regardless. VALIDATE AGAINST A PRINTED PANJIKA before release
       — this is exactly what the release-blocker gate in PRD 16 is for. */

/* Exact JD at which the sidereal sun crosses into `rashi`, by bisection. */
function sankrantiJD(rashi, jdGuessLo, jdGuessHi) {
  const f = j => norm360(sidereal(sunLongitude(j), j) - rashi * 30 + 180) - 180;
  let lo = jdGuessLo, hi = jdGuessHi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/* Local civil day number (integer) for a JD, in the given timezone. */
const civilDay = (jd, tz) => Math.floor(jd + tz / 24 + 0.5);
const gregOf = (jd, tz) => new Date((jd + tz / 24 - 2440587.5) * 86400000);

/* Walk back from jdRef until the sidereal sun is in a different sign, then
   bisect that one-day window. Robust without needing to guess a bracket. */
function sankrantiBefore(jdRef, rashi) {
  for (let k = 1; k <= 40; k++) {
    const lo = jdRef - k;
    if (Math.floor(sidereal(sunLongitude(lo), lo) / 30) !== rashi) {
      return sankrantiJD(rashi, lo, lo + 1);
    }
  }
  return null;
}

/* Which civil day is day 1 of the month this sankranti opens? */
function day1For(sJD, tradition, tz, lat, lon) {
  const sDay = civilDay(sJD, tz);
  if (tradition !== "tamil") return sDay + 1;         // Bengali: the following day
  const g = gregOf(sJD, tz);
  const ev = sunEvents(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate(), lat, lon, tz);
  const hourLocal = ((sJD + tz / 24 + 0.5) % 1) * 24;
  return (ev.sunset != null && hourLocal < ev.sunset) ? sDay : sDay + 1;   // Tamil: sunset rule
}

function solarMonthDay(jd, tz, tradition, lat, lon) {
  const today = civilDay(jd, tz);
  // Evaluate at the END of the civil day, so a sankranti occurring later the
  // same day is already accounted for; the day1 rule then decides ownership.
  const endOfDay = today - tz / 24 + 0.5 - 1e-6;

  let rashi = Math.floor(sidereal(sunLongitude(endOfDay), endOfDay) / 30);
  let sJD = sankrantiBefore(endOfDay, rashi);
  let d1 = day1For(sJD, tradition, tz, lat, lon);

  if (d1 > today) {                       // sankranti happened, but this day still
    rashi = (rashi + 11) % 12;            // belongs to the previous month
    sJD = sankrantiBefore(sJD - 1, rashi);
    d1 = day1For(sJD, tradition, tz, lat, lon);
  }
  return { rashi, day: today - d1 + 1, sankrantiJD: sJD };
}

/* Gregorian year in which the CURRENT solar year began (its Mesha sankranti).
   Mesha sankranti always falls 13-16 April, so a 10-20 April bracket is safe. */
function yearStartGregorian(jd, tz, tradition, lat, lon) {
  const today = civilDay(jd, tz);
  const gy = gregOf(jd, tz).getUTCFullYear();
  let s = sankrantiJD(0, toJD(gy, 4, 10, -tz), toJD(gy, 4, 20, -tz));
  if (day1For(s, tradition, tz, lat, lon) > today) {
    s = sankrantiJD(0, toJD(gy - 1, 4, 10, -tz), toJD(gy - 1, 4, 20, -tz));
    return gy - 1;
  }
  return gy;
}

function bengaliDate(jd, tz, lat, lon) {
  const { rashi, day } = solarMonthDay(jd, tz, "bengali", lat, lon);
  const startY = yearStartGregorian(jd, tz, "bengali", lat, lon);
  return {
    year: startY - 593,                   // Bengali year increments at Boishakh 1
    monthIndex: rashi, month: BENGALI_MONTHS[rashi], monthLatin: BENGALI_MONTHS_LATIN[rashi],
    day,
  };
}

function tamilDate(jd, tz, lat, lon) {
  const { rashi, day } = solarMonthDay(jd, tz, "tamil", lat, lon);
  const startY = yearStartGregorian(jd, tz, "tamil", lat, lon);
  return {
    yearName: TAMIL_YEARS[((startY - 1987) % 60 + 60) % 60],   // Prabhava began 1987
    monthIndex: rashi, month: TAMIL_MONTHS[rashi], monthLatin: TAMIL_MONTHS_LATIN[rashi],
    day,
  };
}

/* ---- Festivals ----------------------------------------------------------- */
/* Derived from panchang rules, never copied from an almanac. Deliberately a
   short list: each entry is a rule this engine can actually evaluate. */
function festivalsFor(p) {
  const out = [];
  const { tithi, bengali, tamil } = p;
  if (bengali.monthIndex === 0 && bengali.day === 1) out.push("Poila Boishakh");
  if (tamil.monthIndex === 0 && tamil.day === 1) out.push("Puthandu");
  if (tamil.monthIndex === 9 && tamil.day === 1) out.push("Thai Pongal");
  if (tithi.name === "Amavasya") out.push("Amavasya");
  if (tithi.name === "Purnima") out.push("Purnima");
  if (tithi.name === "Ekadashi") out.push("Ekadashi");
  if (bengali.monthIndex === 5 && tithi.paksha === "Shukla" &&
      [7, 8, 9, 10].includes(tithi.index % 15 === 0 ? 15 : tithi.index)) {
    const names = { 7: "Durga Saptami", 8: "Durga Ashtami", 9: "Durga Navami", 10: "Vijaya Dashami" };
    if (names[tithi.index]) out.push(names[tithi.index]);
  }
  return out;
}

/* ---- Public API ---------------------------------------------------------- */
const PLACES = {
  kolkata: { name: "Kolkata", lat: 22.5726, lon: 88.3639, tz: 5.5 },
  chennai: { name: "Chennai", lat: 13.0827, lon: 80.2707, tz: 5.5 },
  delhi:   { name: "Delhi",   lat: 28.6139, lon: 77.2090, tz: 5.5 },
};

function panchang(dateISO, placeKey = "kolkata") {
  const place = PLACES[placeKey] || PLACES.kolkata;
  const [y, m, d] = dateISO.split("-").map(Number);

  const sun = sunEvents(y, m, d, place.lat, place.lon, place.tz);
  // Panchang elements are conventionally read at sunrise.
  const hourUTC = (sun.sunrise != null ? sun.sunrise : 6) - place.tz;
  const jd = toJD(y, m, d, hourUTC);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const p = {
    date: dateISO, place: place.name, weekday,
    system: { bengali: "Vishuddha Siddhanta", tamil: "Thirukanitham", basis: "drik" },
    tithi: tithiAt(jd),
    nakshatra: nakshatraAt(jd),
    yoga: yogaAt(jd),
    karana: karanaAt(jd),
    sunrise: sun.sunrise, sunset: sun.sunset,
    periods: eighthPeriods(sun.sunrise, sun.sunset, weekday),
    bengali: bengaliDate(jd, place.tz, place.lat, place.lon),
    tamil: tamilDate(jd, place.tz, place.lat, place.lon),
  };
  p.festivals = festivalsFor(p);
  return p;
}

const fmtHM = h => h == null ? "--:--"
  : String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
const fmtSpan = s => s ? fmtHM(s.from) + "–" + fmtHM(s.to) : "--";

if (typeof module !== "undefined" && module.exports) {
  module.exports = { panchang, sunLongitude, moonLongitude, sidereal, ayanamsa,
                     toJD, tithiAt, nakshatraAt, PLACES, fmtHM, fmtSpan, norm360,
                     sankrantiJD, localName, localPaksha, localDigits, localYearName,
                     NAMES_LOCAL, TAMIL_YEARS };
}
