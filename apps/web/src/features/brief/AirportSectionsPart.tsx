import { Suspense, type ComponentProps } from "react";
import { fromChunk } from "../../lib/fromChunk";

// The Brief's airport sections on a chunk of their own: they are the one
// part of the Brief that draws an airport card's rows (place/lazy's
// frequencies, runways and publications), and drawn with the Brief they
// brought the whole airport card's chunk with every route opened, though
// a route draws no airport card until one is tapped (the speed audit of
// 2026-11-21, finding 2). Fetched as the Brief's card comes up
// (BriefCard), and drawn straight from the chunk once it is in (fromChunk).
const { Part, prefetch } = fromChunk(
  () => import("./AirportSections"),
  (m) => m.default,
);

/** Asks for the airport sections' chunk ahead of the Brief's pages. */
export const prefetchAirportSections = prefetch;

/** The Brief's airport sections (AirportSections), nothing in their place
 *  for the moment their chunk is still coming. */
export default function AirportSectionsPart(props: ComponentProps<typeof Part>) {
  return (
    <Suspense fallback={null}>
      <Part {...props} />
    </Suspense>
  );
}
