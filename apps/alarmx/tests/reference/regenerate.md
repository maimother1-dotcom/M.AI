# Regenerating `bangladesh-1461-days.tsv`

The golden file is frozen output from **two independent MIT-licensed
implementations** of the revised Bengali calendar. They agreed on all 1461 days
(2025-01-01 to 2028-12-31), which is why their output is trustworthy enough to
assert against with zero tolerance.

Neither implementation is vendored into this repo. Only the agreed output is,
so the test suite runs with no Python or Go dependency.

## What the two sources are

| Source | Language | Licence |
|---|---|---|
| [`bangla`](https://pypi.org/project/bangla/) — Ahmedur Rahman Shovon | Python | MIT |
| `ponjika`, ported from [`nuhil/bangla-calendar`](https://github.com/nuhil/bangla-calendar) | Go | MIT |

Both implement the **revised standard adopted in Bangladesh in 1987**: fixed
month lengths, Pohela Boishakh pinned to 14 April, Falgun gaining a day in
Gregorian leap years.

## Steps

```bash
pip install bangla
python3 - <<'PY'
import bangla, datetime
BN2LAT = {'বৈশাখ':'Boishakh','জ্যৈষ্ঠ':'Jyoishtho','আষাঢ়':'Asharh','শ্রাবণ':'Shrabon',
          'ভাদ্র':'Bhadro','আশ্বিন':'Ashwin','কার্তিক':'Kartik','অগ্রহায়ণ':'Ogrohayon',
          'পৌষ':'Poush','মাঘ':'Magh','ফাল্গুন':'Falgun','চৈত্র':'Choitro'}
d = datetime.date(2025, 1, 1)
for i in range(1461):
    x = d + datetime.timedelta(days=i)
    r = bangla.get_date(x.day, x.month, x.year)
    day = int(bangla.convert_bangla_digit_to_english_digit(r['date']))
    yr  = int(bangla.convert_bangla_digit_to_english_digit(r['year']))
    print(f"{x.isoformat()}\t{day}\t{BN2LAT[r['month']]}\t{yr}")
PY
```

Then do the same with the Go package and **diff the two**. Only keep rows where
they agree. Normalise the Go month spellings, which differ:

```
Boisakh→Boishakh  Joistho→Jyoishtho  Ashar→Asharh  Shraban→Shrabon
Vadro→Bhadro  Ashin→Ashwin  Agrahan→Ogrohayon  Chaitra→Choitro  Maagh→Magh
```

Note: the uploaded `ponjika.go` references `enToBnNumber`, which lives in a file
of that package that was not supplied. Any correct Bengali-numeral function
compiles it; the numeral output is not part of the comparison.

Finally, re-attach the provenance header from the top of the existing `.tsv`.

## What this file does and does not prove

**Does:** AlarmX's `bengaliDateBD()` reproduces the Bangladesh calendar exactly,
and the shared parts of both Bengali systems — month names, month order, year
numbering, Bengali numerals — are correct.

**Does not:** validate Vishuddha Siddhanta drik dates beyond the new year, and
validates no tithi, nakshatra, yoga or karana at all. **None of these references
compute any of those.** The 60-date printed-panjika cross-check in PRD §16.3 is
still a release blocker.
