import { Suspense, lazy } from "react";
import { useProfileOpen } from "../../lib/airplane/profileStore";
import { useProfileAddress } from "./useProfileAddress";
import KeepFiguresOffer from "./KeepFiguresOffer";
import { EngineGate } from "../../lib/engine/engineGate";

/** The profile's own chunk, fetched the first time one opens: nothing of
 *  it in the map page's first load (the web's bundle budget). */
const AirplaneProfileSheet = lazy(() => import("./AirplaneProfileSheet"));

/** Where an airplane's profile opens over the page (MapPage), only while
 *  one is open, and the offer of figures kept signed out at sign-in. */
export default function AirplaneProfileHost() {
  const open = useProfileOpen((s) => !!s.open);
  useProfileAddress();
  return (
    <>
      <KeepFiguresOffer />
      {open && (
        <Suspense fallback={null}>
          {/* Its figures are the engine's: opened from the address (?airplane=)
            as the page loads, it waits for the .wasm (MapPage). */}
          <EngineGate>
            <AirplaneProfileSheet />
          </EngineGate>
        </Suspense>
      )}
    </>
  );
}
