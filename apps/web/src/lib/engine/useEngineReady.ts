import { use, useSyncExternalStore } from "react";
import { engineLoaded, engineReady } from "./engine";

// Told once the engine is there; nothing to take back, since it never
// unloads.
const subscribe = (changed: () => void) => {
  let live = true;
  void engineReady.then(() => {
    if (live) changed();
  });
  return () => {
    live = false;
  };
};

/** Whether the shared engine (lib/engine) can answer now: false while its
 *  .wasm is still coming, true from then on (EngineGate). A part that
 *  asks it while it renders reads this first and draws without the
 *  figure until then, and its memos, keyed on it, work it out again once
 *  it is there. */
export function useEngineReady(): boolean {
  return useSyncExternalStore(subscribe, engineLoaded, engineLoaded);
}

/** Waits for the engine where `needed`: the component suspends (React's
 *  `use`, on the one promise the engine settles) to its nearest Suspense
 *  boundary until the .wasm is there. For what cannot be drawn at all
 *  without it -- a route in the address is read by the engine's rules
 *  (lib/identSchema) -- where a part that can is drawn at once with
 *  useEngineReady instead. Whether it is there, as useEngineReady says. */
export function useEngineWhen(needed: boolean): boolean {
  // Asked every render it is needed, loaded or not: React holds a part
  // that suspended on `use` to asking it again as it finishes, and the
  // promise is marked settled once the engine is there (loadEngine), so
  // then it answers at once.
  if (needed) use(engineReady);
  return useEngineReady();
}
