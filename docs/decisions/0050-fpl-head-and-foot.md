# 0050. FPL's head is Search and the ✕, its foot is the figures and the floating bar

- **Date:** 2026-11-21
- **Status:** Accepted
- **Amends:** 0045 (the head) and 0047 (the head's first row)

## Context

Across 2026-11-20 and 2026-11-21 the owner went through FPL on his iPhone
and set its head and foot piece by piece. The pieces are in rules.md §4a
and web.md; this page keeps the reasons together so one is not undone for
another's sake.

## Decision

1. **The word FPL is on Search's page only.** The page toggle at the start
   of Search's row says FPL (the owner, 2026-11-20: "Fpl button icon can
   just say FPL"; "FPL button was supposed to be on search page as it is
   now, I just wanted the route icon replaced by the letters FPL"; 95fd57f19).
   The field's placeholder is the one word "Search" (the owner: "just say
   Search"), also while it asks for something; its accessible name keeps
   "Search airports and airplanes" (WCAG 2.5.3).
2. **FPL's head has Search at its start and the ✕ at its end** (the owner:
   "replace the share button with search button"; "to clear route you don't
   have to long press"; "✕ clears"). The ✕ asks "Clear Route?" in the
   centred alert on one tap; Search turns the sheet to Search's resting
   page with the route kept. Its title is a heading's 20 points, lifted
   (the owner: "Can flight plan title be a bit bigger and move up a bit?").
3. **The N-number and the altitude end in a glyph of their own** (the
   owner: "can N number show an info button and can FL show profile button
   rather than in the tab bar?"); the floating bar is Brief, Nav Log and
   More.
4. **The figure strip is at the sheet's foot at every size and scroll**,
   the route sliding under it (the owner: "The figures used to be fine
   before, they would go to bottom and stay there while the rest slides
   under it"), the bar 4 points over it (a3d429783).
5. **The strip's fourth figure is Track, not Fuel** (the owner: "replace
   Fuel with Track at the bottom figures"): the airplane's GPS track in
   degrees magnetic, the engine's `magnetic_variation` applied. The fuel is
   on the timeline's gauges, the nav log and the Brief.
6. **FPL's bar and the airport card's are one bar** (the owner: "fpl and
   other tabs placement look different"): the same height, the same item
   width, the same place (`FloatingBar`).

## Consequences

- The strip has no fuel breakdown; Add Fuel Stops is the timeline's pill.
- The phones keep their layouts until the owner's word (decision 0038).
