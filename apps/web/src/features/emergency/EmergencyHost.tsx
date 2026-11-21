import { Suspense, useEffect } from "react";
import { useEmergencyOpen } from "../../lib/emergencyStore";
import { EngineGate } from "../../lib/engine/engineGate";
import { fromChunk } from "../../lib/fromChunk";

/** The sheet's own chunk: nothing of it in the map page's first load (the
 *  web's bundle budget). Drawn straight from its module once fetched
 *  (fromChunk), not through `lazy`, which suspends the first open once
 *  even with the chunk in hand. */
const { Part: EmergencySheet, prefetch } = fromChunk(
  () => import("./EmergencySheet"),
  (m) => m.default,
);

/** Where the emergency assistant opens over the page (MapPage), and only
 *  while it is open: its hook follows own ship and asks the planner, so
 *  shut it costs nothing. Its chunk is fetched once the page is idle, so
 *  the sheet opens at once when asked (docs/design/web.md §8), not after
 *  a download in the worst moment to wait for one. */
export default function EmergencyHost() {
  const open = useEmergencyOpen((s) => s.open);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 3000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(prefetch);
    return () => cancel(handle);
  }, []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      {/* Its glide and its fields are the engine's (MapPage draws before it). */}
      <EngineGate>
        <EmergencySheet />
      </EngineGate>
    </Suspense>
  );
}
