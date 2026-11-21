import { Suspense, lazy, useEffect } from "react";
import { useProfileOpen } from "../../lib/airplane/profileStore";
import { useProfileAddress } from "./useProfileAddress";
import { EngineGate } from "../../lib/engine/engineGate";
import { fromChunk } from "../../lib/fromChunk";

/** The profile's own chunk: nothing of it in the map page's first load
 *  (the web's bundle budget), fetched once the page is idle, so an
 *  airplane's card opens at once, not after a download (the speed audit of
 *  2026-11-21), and drawn straight from its module (fromChunk). */
const { Part: AirplaneProfileSheet, prefetch } = fromChunk(
  () => import("./AirplaneProfileSheet"),
  (m) => m.default,
);
/** The offer of figures kept signed out, made only at a sign-in: its chunk
 *  asked for as the page mounts, after the first screen's script. */
const KeepFiguresOffer = lazy(() => import("./KeepFiguresOffer"));

/** Where an airplane's profile opens over the page (MapPage), only while
 *  one is open, and the offer of figures kept signed out at sign-in. */
export default function AirplaneProfileHost() {
  const open = useProfileOpen((s) => !!s.open);
  useProfileAddress();
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 3000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(prefetch);
    return () => cancel(handle);
  }, []);
  return (
    <>
      <Suspense fallback={null}>
        <KeepFiguresOffer />
      </Suspense>
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
