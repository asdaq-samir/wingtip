# 0056. One set of words on all three apps, generated from one table

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: "Yes to all", "Just fix it
  all no matter how big the job")
- **Amends:** 0021 (Title Case labels), which it makes exact; carries on
  0020 ("airplane")

## Context

The words audit of 2026-11-21 read every word the web, the iPhone and
Android show. The same thing had different names: "Add Stop", "Add a
Stop" and "Add a stop"; "Enter Route" and "Enter the Route"; "Print Nav
Log" and "Print the Nav Log"; "Show on the map", "Show on the Map" and
"Show on Map". The web wrote about 75 section headings and most figure
names in sentence case ("Empty weight", "True airspeed") where the phones
used Title Case, so decision 0021 was kept on one platform and not the
other. Errors said "could not", "couldn't", "didn't respond" and "could
not be had", some with a full stop and some without. The planning aid's
paragraph, which every app must say alike, was copied by hand into each,
and the copies had already drifted (Android's number had non-breaking
hyphens, the others plain ones). docs/design/rules.md said nothing of
words beyond the map's (section 13).

## Decision

1. **A word every app says is written once**, in `design/wording.json`,
   and `scripts/build/wording.sh` generates the web's `WORDING`, the
   iPhone's `Wording` (each a `String(localized:)`, kept by the string
   catalog) and Android's `R.string.wording_*`, as the design tokens and
   the screens are; CI and the pre-push hook run it with `--check`. A
   screen's title stays `design/screens.json`'s.
2. **The generator checks each word's kind**: a label is in Title Case
   (Apple's title style), a sentence ends with its stop, progress with one
   "…", a value with none; no "..." and no "aircraft" or "plane" unless
   the entry says whose term it keeps.
3. **The rules for words are docs/design/rules.md section 18**: names in
   Title Case, sentences in sentence case with their stop, "Fetching …",
   errors with "could not" and "did not answer", the FAA's words and codes
   as the FAA writes them, and the map's words and the FAA's raw text as
   sections 13 and 0020 say.

## Consequences

About 1,200 strings changed across the three apps (the audit's table,
2026-11-21), with the specs and unit tests that assert them. Each app has
a test that its shared words are the table's (`lib/wording/wording.test.ts`,
`WordingTests`, `WordingTest`). A word a second app comes to say goes into
the table, not into the app.

## Source

The owner's approval of the words audit, 2026-11-21; Apple's Human
Interface Guidelines ("Writing", title-style capitalization) and the
Apple Style Guide; decisions 0020 and 0021.
