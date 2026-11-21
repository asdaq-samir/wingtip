# 0052. The map shows the big fields and their airspace from zoom 5

- **Date:** 2026-11-21
- **Status:** Accepted

## Context

At about zoom 6 over California the map drew eleven fields and no Class C
ring, where ForeFlight drew every big field and the Class B and C airspace.
The owner, 2026-11-21: "how come we don't see big airports and airspaces
at our zoom levels?"

## Decision

From zoom 5 the towered fields (the engine's `field_mark_rank` first tier)
and the Class B and C rings, the rings half width with no band and only the
Class B fields named; from 6 every drawn field named; from 7 the long
hard-runway public fields, the Class D rings, the restricted areas and
MOAs and the rings at full width; the rest as before. Marks keep 2 px
apart at every zoom (it was 27 px below zoom 7, which hid KOAK and KFAT).
The overlay tiles hold the towered fields and Class C from the archive's
first zoom, so `wingtip.vector_tiles.VERSION` is 9 (1a8b41fa9).

## Consequences

- rules.md "What is drawn from which zoom" is the table; services/jobs
  README's layer table gives the tiles' first zooms.
- places-chart.spec asks for no mark's box within 4 px of another's at the
  route's whole-view zoom (8a5e7222c), not the old 78 px.
