import { Suspense, type ReactNode } from "react";
import { EngineGate, WorkingOut } from "../../../../lib/engine/engineGate";

/** A card or a list in the sheet (PlanSidebar): its chunk, then the shared
 *  engine its figures are worked out by (lib/engine), each waited for in
 *  its place -- the search and the sheet drawn at once round it (MapPage),
 *  and "Working out…" here for the moment a card opened from the address,
 *  or tapped as the page opens, waits for the .wasm. */
export default function Waits({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <EngineGate fallback={<WorkingOut />}>{children}</EngineGate>
    </Suspense>
  );
}
