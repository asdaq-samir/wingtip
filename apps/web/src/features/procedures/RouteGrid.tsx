import { useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "react-aria-components";
import { GripVertical } from "lucide-react";
import { pointName } from "../../lib/identSchema";
import { afterRouteDrawn } from "../../lib/routeDrawn";
import type { RouteGridProps } from "./RouteGridList";

export type { RouteGridProps, RouteItem } from "./RouteGridList";

// The list with its drag and drop (RouteGridList: React Aria's GridList,
// useDragAndDrop and the selection and drop code under them, about 245 KB)
// on a chunk of its own: a route link drew none of it, but fetched it with
// the route's panel, 25 KB over its budget (route-load.spec, the re-audit
// of 2026-11-22). Asked for at the first touch of the list or a moment
// after the route has drawn (lib/routeDrawn), whichever comes first.
type List = ComponentType<RouteGridProps>;
let loaded: List | null = null;
let asked: Promise<List> | null = null;
const told = new Set<() => void>();
function fetchList() {
  asked ??= import("./RouteGridList").then((module) => {
    loaded = module.default;
    for (const tell of told) tell();
    return module.default;
  });
  return asked;
}
/** How long after the route opened has drawn the list's chunk is asked for. */
const AFTER_MS = 2000;

/**
 * FPL's route list (RouteGridList, where its reading is): drawn at once
 * as plain rows of the same look and roles, and as React Aria's GridList,
 * with its drag and drop, once its chunk is in. The plain rows are put
 * away only while nothing in them has the focus, so a field a pilot is
 * typing in keeps it; a hold that began on a plain row is the one lift
 * that may need asking again.
 */
export function RouteGrid(props: RouteGridProps) {
  "use no memo"; // The list drawn is a component from its module.
  const [List, setList] = useState<List | null>(() => loaded);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (List) return;
    const take = () => {
      const list = loaded;
      if (list && !box.current?.contains(document.activeElement)) setList(() => list);
    };
    const rows = box.current;
    // The focus gone from the rows: looked at once it has landed.
    const left = () => window.setTimeout(take, 0);
    rows?.addEventListener("focusout", left);
    told.add(take);
    const later = afterRouteDrawn(() => void fetchList().catch(() => {}), AFTER_MS);
    take();
    return () => {
      told.delete(take);
      rows?.removeEventListener("focusout", left);
      later();
    };
  }, [List]);
  if (List) return <List {...props} />;
  const wake = () => void fetchList().catch(() => {});
  return (
    <div ref={box} onPointerDownCapture={wake} onFocusCapture={wake} onKeyDownCapture={wake}>
      <div role="grid" aria-label="The route" className="outline-none" data-testid="procedures">
        {props.items.map((item) => (
          <div key={item.id} role="row" tabIndex={-1} className="relative outline-none" data-point={item.point}>
            <div role="gridcell" style={{ display: "contents" }}>
              {item.node}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A typed point's drag button, React Aria's: Enter for the keyboard's and
 *  VoiceOver's drag, out of sight (its row is what a finger drags). */
export function PointGrip({ ident }: { ident: string }) {
  return (
    <Button
      slot="drag"
      aria-label={`Move ${pointName(ident)}`}
      data-testid="route-grip"
      data-ident={ident}
      // Its drag the row's, not the stock sheet's.
      data-base-ui-swipe-ignore=""
      // Out of sight, the keyboard's and VoiceOver's drag button alone (React
      // Aria asks one of every row): its three lines gave way to the
      // line's chevron (the owner, 2026-11-19: "replace three lines with the
      // arrow for expanding list"); a finger or a mouse drags the row itself,
      // and the point's menu has Move Up and Move Down. Shown with its
      // grip while the keyboard has it, so a Tab never lands out of sight
      // (WCAG 2.4.7; the grouped box's audit, 2026-11-20).
      className="sr-only data-focus-visible:not-sr-only data-focus-visible:grid data-focus-visible:size-11 data-focus-visible:shrink-0 data-focus-visible:place-items-center data-focus-visible:rounded-lg data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:outline-none"
    >
      <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
    </Button>
  );
}
