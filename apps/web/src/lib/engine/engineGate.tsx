import type { ReactNode } from "react";
import { useEngineReady } from "./useEngineReady";

/**
 * What asks the engine while it renders, drawn only once the engine is
 * there, and `fallback` in its place until then: so the page's shell
 * paints without waiting for the .wasm (main.tsx), and `callEngine` can
 * stay synchronous for everything drawn inside.
 */
export function EngineGate({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return useEngineReady() ? children : fallback;
}
