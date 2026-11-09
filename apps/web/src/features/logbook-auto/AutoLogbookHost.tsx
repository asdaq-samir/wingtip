import { Suspense, lazy } from "react";
import { useAutoLogbook } from "./useAutoLogbook";

/** The sheet's own chunk, fetched the first time a flight ends: nothing
 *  of it in the map page's first load (the web's bundle budget). */
const FlightLoggedSheet = lazy(() => import("./FlightLoggedSheet"));

/** Where a flight is recorded and, once it has ended, offered for the
 *  logbook (MapPage): the hook records own ship's fixes all along, and
 *  the sheet is drawn only while a draft is open. */
export default function AutoLogbookHost() {
  const log = useAutoLogbook();
  if (!log.open) return null;
  return <Suspense fallback={null}><FlightLoggedSheet log={log} /></Suspense>;
}
