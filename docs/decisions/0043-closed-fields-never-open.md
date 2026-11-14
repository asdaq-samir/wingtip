# 0043. A closed field is never shown or offered as an open one

- **Date:** 2026-11-13
- **Status:** Accepted

## Context

The private, military and closed fields audit of 2026-11-13 (finding
PF-1) found that the planner's field table, OurAirports' US airports cut
to those NASR lists, kept every APT_BASE row whatever its ARPT_STATUS.
NASR's 2026-10-29 cycle lists 288 fields as closed (285 CI, closed
indefinitely; 3 CP, closed permanently), and 229 of them were in that
table as ordinary small airports: 00MO Cooper Flying Service, 01UT La Sal
Junction, 0MI6 Young's and the rest. They were on the map's tap targets
and weather chips, in search and DEP/DEST, Nearest and Find Nearby, the
emergency list and the copilot's diversion (both read
`airports.nearest`), and the airport card, with nothing said. An
emergency list could rank a closed strip first. The chart marks and the
phones' packs already kept status O alone, each by its own comparison,
and the phones' spoken places dropped CI but kept CP (PF-2).

The owner, the same day: "Please make it a hard rule to not show closed
fields as open."

## Decision

- A field NASR lists with any ARPT_STATUS but O (CI, CP, a blank or any
  other code) is closed. It is never shown or offered as an open field:
  not on the map, in Nearest or Find Nearby, among an emergency's glide
  candidates or the copilot's diversions, as a fuel stop, a stop or an
  IFR alternate, a checkpoint, or a spoken place.
- Where it appears at all, a pilot typing its ident in a search or
  opening its card by link, it is labelled "Closed indefinitely" or
  "Closed permanently" (or "Closed"), comes after the open fields a
  search finds with it, and is never ranked.
- The rule is the engine's, once: `field_status` (engine/crates/flight,
  field.rs) rules a status open or closed and words the label, and
  `best_fields` drops a closed candidate whatever the host sends. The
  planner carries NASR's status as data (`wingtip.field_status`) and asks
  the engine; the chart overlays, the packs' fields in view and spoken
  places, the fuel stops and the checkpoints ask the same rule.
- A field with no NASR record at all (a test's airports file with no FAA
  file beside it) is not judged by the rule: its own source decides.

## Consequences

- The map, Nearest, the emergency list, the copilot, fuel stops and
  alternates lose the 229 closed fields; a search for one still finds it,
  labelled, as does its card ("(Closed indefinitely)" beside its name on
  the web).
- The search index the browser keeps (`/api/airports/index`, shape 3)
  carries each closed field's label beside the rows, so the web's search
  labels it and its on-device Nearest and Emergency leave it out.
- The planner's `AirportPlace.closed` and `AirportSuggestion.closed` say
  it to every app; the phones' cards and search rows do not show it yet.
- Held by tests at each level: the engine's own (O, CI, CP, blank, none),
  `best_fields` and the packs' views, the planner's every path over seeded
  closed fields and over the real NASR and OurAirports files where they
  are on disk (services/planner/tests_wingtip/test_closed_fields.py), and
  the web's index and search row.
