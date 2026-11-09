import { Suspense, lazy } from "react";
import { useEmergencyOpen } from "../../lib/emergencyStore";

/** The sheet's own chunk, fetched the first time it opens: nothing of it
 *  in the map page's first load (the web's bundle budget). */
const EmergencySheet = lazy(() => import("./EmergencySheet"));

/** Where the emergency assistant opens over the page (MapPage), and only
 *  while it is open: its hook follows own ship and asks the planner, so
 *  shut it costs nothing. */
export default function EmergencyHost() {
  const open = useEmergencyOpen(s => s.open);
  if (!open) return null;
  return <Suspense fallback={null}><EmergencySheet /></Suspense>;
}
