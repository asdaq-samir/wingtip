# 0026. The map has no OpenStreetMap layer

- **Date:** 2026-09-21
- **Status:** Accepted

## Context

The owner wanted the chart to render as fast as OSM did, and OSM gone.

## Decision

The FAA sectional is the default base; the IFR enroute charts are alternative bases; the TAC and IFR area charts are overlays. Under the chart sits a plain hydrography base (USGS, public domain) so Canada, Mexico and the sea are not grey.

## Consequences

Do not add OSM tiles. See [GOOGLE-MAPS.md](../GOOGLE-MAPS.md) for the imagery under the chart.

## Source

The owner, 2026-09-21; commit 579f1aa6.
