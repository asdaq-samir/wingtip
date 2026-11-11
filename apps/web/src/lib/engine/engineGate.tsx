import type { ReactNode } from "react";
import { useEngineReady } from "./useEngineReady";

/**
 * What asks the engine while it renders, drawn only once the engine is
 * there, and `fallback` in its place until then: so the page paints
 * without waiting for the .wasm (main.tsx), each part that needs a rule's
 * answer waiting on its own -- a figure's "Working out…" (lib/problems'
 * Working), or nothing -- and `callEngine` can stay synchronous for
 * everything drawn inside. `when` false draws the children at once, for
 * a parent whose need for it depends on what it draws.
 */
export function EngineGate({ fallback = null, when = true, children }: { fallback?: ReactNode; when?: boolean; children: ReactNode }) {
  const ready = useEngineReady();
  return !when || ready ? children : fallback;
}

/** A part's place while the engine comes: "Working out…", said to a
 *  screen reader as a status, as the Brief's figures say theirs. */
export function WorkingOut({ className }: { className?: string }) {
  return (
    <p className={className ?? "px-4 py-3 text-muted-foreground"} role="status">
      Working out…
    </p>
  );
}
