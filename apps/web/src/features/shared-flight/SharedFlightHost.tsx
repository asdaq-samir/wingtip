import { Suspense, lazy } from "react";
import { useSharedLink } from "./store";

/** The preview's own chunk, fetched only when a shared flight's link
 *  opened the page: nothing of it in the map's first load (the web's
 *  bundle budget). */
const SharedFlightSheet = lazy(() => import("./SharedFlightSheet"));

/** Where a flight another pilot sent is previewed (MapPage): drawn only
 *  while one waits for the receiver's answer. */
export default function SharedFlightHost() {
  const link = useSharedLink((s) => s.link);
  if (!link) return null;
  return (
    <Suspense fallback={null}>
      <SharedFlightSheet link={link} />
    </Suspense>
  );
}
