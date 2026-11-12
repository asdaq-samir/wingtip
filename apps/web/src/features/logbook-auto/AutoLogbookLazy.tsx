import { Suspense, lazy } from "react";

// The recorder and its sheet on a chunk of their own, asked for as the map
// page draws rather than in its first load (scripts/first-load.mjs,
// 2026-11-12): it watches own ship's fixes, which come a GPS fix later.
const Host = lazy(() => import("./AutoLogbookHost"));

/** Where a flight is recorded and offered for the logbook (AutoLogbookHost). */
export default function AutoLogbookLazy() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
