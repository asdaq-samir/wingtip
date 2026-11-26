import { Suspense, lazy, useEffect } from "react";
import { useProfileOpen } from "../../lib/airplane/profileStore";
import { useAddressKey } from "../../lib/address";
import { useProfileAddress } from "./useProfileAddress";
import { EngineGate } from "../../lib/engine/engineGate";
import { fromChunk } from "../../lib/fromChunk";

/** The card's own chunk: nothing of it in the map page's first load
 *  (the web's bundle budget), fetched once the page is idle, so an
 *  airplane's card opens at once, not after a download (the speed audit of
 *  2026-11-21), and drawn straight from its module (fromChunk). */
const { Part: AirplaneCard, prefetch } = fromChunk(
  () => import("./AirplaneCard"),
  (m) => m.default,
);
/** The offer of figures kept signed out, made only at a sign-in: its chunk
 *  asked for as the page mounts, after the first screen's script. */
const KeepFiguresOffer = lazy(() => import("./KeepFiguresOffer"));

/** Where the one airplane card opens over the page (MapPage), only while
 *  one is open -- by its N-number (lib/airplane/profileStore, `airplane=`)
 *  or by its ICAO address (traffic on the map, `flight=`) -- and the offer
 *  of figures kept signed out at sign-in. */
export default function AirplaneCardHost() {
  const open = useProfileOpen((s) => s.open);
  const [flight] = useAddressKey("flight");
  useProfileAddress();
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 3000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(prefetch);
    return () => cancel(handle);
  }, []);
  const tail = open?.tail ?? null;
  return (
    <>
      <Suspense fallback={null}>
        <KeepFiguresOffer />
      </Suspense>
      {(tail || flight) && (
        <Suspense fallback={null}>
          {/* Its figures are the engine's: opened from the address as the
            page loads, it waits for the .wasm (MapPage). One card an
            airplane, new for another: by its N-number while it has one. */}
          <EngineGate>
            <AirplaneCard key={tail ?? flight} tail={tail} hex={flight} focus={open?.focus ?? null} figures={!!open?.figures} />
          </EngineGate>
        </Suspense>
      )}
    </>
  );
}
