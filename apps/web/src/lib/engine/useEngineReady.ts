import { useSyncExternalStore } from "react";
import { engineLoaded, engineReady } from "./engine";

// Told once the engine is there; nothing to take back, since it never
// unloads.
const subscribe = (changed: () => void) => {
  let live = true;
  void engineReady.then(() => { if (live) changed(); });
  return () => { live = false; };
};

/** Whether the shared engine (lib/engine) can answer now: false while its
 *  .wasm is still coming, true from then on (EngineGate). */
export function useEngineReady(): boolean {
  return useSyncExternalStore(subscribe, engineLoaded, engineLoaded);
}
