import { Suspense, lazy, useEffect } from "react";
import { useEmergencyOpen } from "../../lib/emergencyStore";
import { EngineGate } from "../../lib/engine/engineGate";

/** The sheet's own chunk: nothing of it in the map page's first load (the
 *  web's bundle budget). */
const load = () => import("./EmergencySheet");
const EmergencySheet = lazy(load);

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
    const handle = idle(() => void load());
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
