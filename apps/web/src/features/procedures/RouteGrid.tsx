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
 * away only while nothing in them is typed in, so a field a pilot is
 * typing in keeps its caret; a control of theirs that has the focus has it
 * again in the list drawn anew; a hold that began on a plain row is the one
 * lift that may need asking again.
 */
export function RouteGrid(props: RouteGridProps) {
  "use no memo"; // The list drawn is a component from its module.
  const [List, setList] = useState<List | null>(() => loaded);
  const box = useRef<HTMLDivElement>(null);
  // The control that had the focus as the rows were put away, by its test
  // id and ident, to have it again in the list drawn anew.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (List) return;
    // Not while a field in them is typed in, nor while a menu opened from
    // them is open: its focus is in its popup, outside the rows, and the
    // swap took its trigger away, so a point's menu tapped as the chunk
    // came in shut under the finger before its Change or Hold could be had
    // (route-fields.spec, procedures-route.spec); a field's line held open
    // (a Collapsible's aria-expanded, no popup) is no menu. Nor where the
    // focused control cannot be found again.
    const held = (rows: HTMLElement) => {
      const at = document.activeElement;
      if (rows.querySelector("[aria-haspopup][aria-expanded=true]")) return null;
      if (!(at instanceof HTMLElement) || !rows.contains(at)) return "";
      if (at.matches("input, textarea, [contenteditable]") || !at.dataset.testid) return null;
      return `[data-testid="${at.dataset.testid}"]${at.dataset.ident ? `[data-ident="${CSS.escape(at.dataset.ident)}"]` : ""}`;
    };
    const take = () => {
      const list = loaded;
      const at = list && box.current ? held(box.current) : null;
      if (at === null) return;
      refocus.current = at || null;
      setList(() => list);
    };
    const rows = box.current;
    // The focus gone from the rows, or moved anywhere once a menu of
    // theirs has closed: looked at once it has landed.
    const left = () => window.setTimeout(take, 0);
    rows?.addEventListener("focusout", left);
    document.addEventListener("focusin", left);
    told.add(take);
    const later = afterRouteDrawn(() => void fetchList().catch(() => {}), AFTER_MS);
    take();
    return () => {
      told.delete(take);
      rows?.removeEventListener("focusout", left);
      document.removeEventListener("focusin", left);
      later();
    };
  }, [List]);
  // The keyboard's place kept across the swap: a grip focused to pick a
  // point up (Enter) is the list's own grip once it is drawn.
  useEffect(() => {
    const at = refocus.current;
    refocus.current = null;
    if (List && at) box.current?.querySelector<HTMLElement>(at)?.focus();
  }, [List]);
  if (List)
    return (
      <div ref={box} data-drag-ready="">
        <List {...props} />
      </div>
    );
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
