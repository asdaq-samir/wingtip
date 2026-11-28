import { fromChunk } from "../../lib/fromChunk";

// The Brief's airport sections on a chunk of their own: they are the one
// part of the Brief that draws an airport card's rows (place/lazy's
// frequencies, runways and publications), and drawn with the Brief they
// brought the whole airport card's chunk with every route opened, though
// a route draws no airport card until one is tapped. Fetched as the Brief's card comes up
// (BriefCard), and drawn straight from the chunk once it is in (fromChunk).
// Apart from AirportSectionsPart, which may export its component alone
// (fast refresh).
export const { Part: AirportSectionsChunk, prefetch: prefetchAirportSections } = fromChunk(
  () => import("./AirportSections"),
  (m) => m.default,
);
