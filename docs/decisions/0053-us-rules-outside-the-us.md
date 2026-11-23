# 0053. A route outside the United States is warned of: its figures are by US rules

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21, taking the recommendation
  of a small guard so no pilot reads a US figure as a Canadian one)

## Context

Every rule the engine holds is the FAA's: 14 CFR part 91, the AIM, the
FAA's data sets. Part 91 governs flight "within the United States,
including the waters within 3 nautical miles of the U.S. coast", with
most of its flight rules carried on to 12 nm (14 CFR 91.1(a) and (b)).
Outside it, a U.S. airplane flies by the foreign country's own rules,
and over the high seas by ICAO Annex 2 (14 CFR 91.703(a)). A route into
Canada was planned with US cruising altitudes, US VFR minimums and US
airspace, and nothing said so: a pilot could read a US figure as a
Canadian one.

Writing Canada's rules (the Canadian Aviation Regulations, the TC AIM,
Nav Canada's data) is a project of its own. Until then the plan should
say what it is.

## Decision

1. **The engine says whose rules a point and a route are under**:
   `jurisdiction_of` (a point: US, CA, MX, BS or other) and
   `route_jurisdiction` (each point, each leg checked every 2 nm along
   its geodesic, the countries met, and the Brief's one line), in
   `engine/crates/flight/src/jurisdiction.rs`. The United States is 14
   CFR 1.1's, with Puerto Rico and the possessions. The outlines are
   Natural Earth's admin-0 countries at 1:50m (public domain), thinned by
   `scripts/build/borders.py` into `engine/crates/flight/data/borders.txt`:
   finely (about a third of a mile) where two countries meet, coarsely
   (about 6 nm) on an open coast. A point on no country's land is its
   nearest country's within 12 nm of the outline, and "other" beyond, so
   the high seas are warned of too.
2. **Warn, never limit.** The route is planned as any other. Where a
   point or a leg lies outside the United States, the engine's words
   stand where the figures are, naming the place, the province in
   Canada, and whose rules: a field there, "CYQT is in Canada (Ontario):
   Canadian rules not checked — figures use US rules", under its row in
   FPL's timeline and before its row on the nav log's rail; a leg across
   a country neither of its ends is in, "The leg to KBUF crosses Canada
   (Ontario): …", on the leg, under the line it leaves from and on the
   rail before its first row, never as the US field's at its end (the
   owner's KUGN, KBUF, KPIT, 2026-11-23). The Brief lists it once among
   its findings, "Part of the route is in Canada (Ontario): …", a
   caution citing 14 CFR 91.703(a).
3. **Web first** (decision 0038): the iPhone and Android follow on the
   owner's word; their generated engine calls carry the two rules
   already.

## Consequences

- The web's WebAssembly grew by the outlines, about 20 KB gzipped,
  to 96% of its gzip budget (`scripts/ci/wasm_size.py` warns from 95%).
- Simplified toward the warning: within the thinning's width of a
  border a point may read either side, and an island too small for the
  1:50m outlines (Bimini) reads "other", which is still warned of.
- When Canada's rules are written, this guard names what is checked and
  what is not, rather than being taken out.
