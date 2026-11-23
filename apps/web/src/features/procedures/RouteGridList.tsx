import { useRef, type DragEvent, type ReactNode } from "react";
import { GridList, GridListItem, useDragAndDrop, type Key } from "react-aria-components";
import { cn } from "cn";
import { feel } from "../../lib/haptics";
import { dropLine } from "../../components/dropLine";

/** One row of FPL's route list: a point, a hold, a field's block, a stop
 *  being added. `point`, a typed point's place among the route's, where
 *  it can be moved. A stop is taken out by its menu's Remove alone: the
 *  row's swipe to the left (SwipeRow, hand-built on Motion) fought the
 *  runway tray's own sideways slide, and the owner let it go (2026-11-17:
 *  "We don't have to do the swipe to remove"). */
export type RouteItem = { id: string; label: string; point?: number; node: ReactNode };

export interface RouteGridProps {
  items: RouteItem[];
  onMove?: (from: number, to: number) => void;
  /** Whether a point may be let go there; no drop line where it may not.
   *  A drop refused with a reason is offered, and refused by `onMove`. */
  canMove?: (from: number, to: number) => boolean;
}

/**
 * FPL's route list (ProceduresRoute), React Aria's GridList with its own
 * drag and drop, as Favorites' rows are (components/SortableRows; the stock
 * audit's W3, the owner 2026-11-11): a typed point's grip (PointGrip)
 * dragged by a mouse or a finger, the stock drop line between the rows
 * showing where it goes (the owner's pick of the line over the ring round
 * a row); a keyboard picks it up with Enter on the grip, moves with the
 * arrow keys and puts it down with Enter, Escape letting it go, each step
 * said in React Aria's own words. Only the typed points are moved and only
 * between them, the list's other rows (holds, a stop being added, the
 * procedures' fixes) neither dragged nor dropped beside. The move is made
 * once, at the drop, by the keys React Aria hands back. Tab goes through a
 * row's own controls, its text boxes keeping their keys.
 *
 * Only rows with a grip are draggable: the rest are React Aria's
 * disabledKeys for selection alone (disabledBehavior "selection"), so
 * their own controls still answer -- which React Aria still lets a mouse or
 * a held finger lift, so the browser's drag from one of them (the stops'
 * pill, a hold) is turned down before it reaches its row (`fixedDrag`). Where no row can move (outside the
 * route's editing) the list has no drag and drop at all, a list of its
 * own (its key), as React Aria asks a drag button of every row of a
 * draggable one and its hooks to be there from the first render or not.
 *
 * A finger also picks a point up by a touch and hold anywhere on its row:
 * React Aria makes the row itself the browser's draggable, and Safari on
 * the iPhone (iOS 15 on) and Chrome on Android lift it on a long press
 * with the system's own lift, preview and, on the iPhone, its tap; the
 * row's words are not selected by the hold (`select-none`, no callout;
 * a text box in it still is, as Safari's would take no caret).
 * The grip stays, shown only where the list edits the route, as iOS's
 * reorder control shows in Edit: the mouse's handle and the keyboard's
 * and VoiceOver's drag button.
 */
export default function RouteGridList({ items, onMove, canMove }: RouteGridProps) {
  const points = new Map(items.flatMap((item) => (item.point === undefined ? [] : [[item.id, item.point] as const])));
  // The row picked up: only a point is put down anywhere.
  const carried = useRef<Key | null>(null);
  const movable = !!onMove && points.size > 0;
  const fixed = items.flatMap((item) => (item.point === undefined ? [item.id] : []));
  // The place a carried point takes, before or after the point it is let
  // go beside, counted once it has left its own place.
  const placeOf = (carriedKey: string, besideKey: string, side: "before" | "after" | "on") => {
    const from = points.get(carriedKey);
    const at = points.get(besideKey);
    if (from === undefined || at === undefined) return null;
    return (side === "after" ? at + 1 : at) - (from < at ? 1 : 0);
  };
  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: !movable,
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": items.find((item) => item.id === key)?.label ?? String(key) })),
    getAllowedDropOperations: () => ["move"],
    onDragStart: (event) => {
      carried.current = [...event.keys][0] ?? null;
      // Felt as it lifts where the browser can (Chrome on Android); the
      // iPhone's own drag gives its own.
      feel("detent");
    },
    onDragEnd: () => {
      carried.current = null;
    },
    // Beside a point, from a point, where it may go; never onto a row.
    getDropOperation: (target) => {
      if (target.type !== "item" || target.dropPosition === "on" || carried.current === null) return "cancel";
      const to = placeOf(String(carried.current), String(target.key), target.dropPosition);
      const from = points.get(String(carried.current));
      return to === null || from === undefined || (to !== from && canMove && !canMove(from, to)) ? "cancel" : "move";
    },
    onReorder: ({ keys, target }) => {
      const key = String([...keys][0]);
      const from = points.get(key);
      const to = placeOf(key, String(target.key), target.dropPosition);
      if (from !== undefined && to !== null && to !== from) onMove?.(from, to);
    },
    // The stock line between the rows where it will go.
    renderDropIndicator: dropLine,
  });
  // A drag begun on a row that is no point (no data-point): the browser's
  // own turned down before React Aria's row hears of it.
  const fixedDrag = (event: DragEvent<HTMLDivElement>) => {
    const row = (event.target as Element).closest?.("[role=row]");
    if (row && !row.hasAttribute("data-point")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <div onDragStartCapture={movable ? fixedDrag : undefined}>
      <GridList
        aria-label="The route"
        key={movable ? "movable" : "fixed"}
        items={items}
        dragAndDropHooks={movable ? dragAndDropHooks : undefined}
        disabledKeys={fixed}
        disabledBehavior="selection"
        keyboardNavigationBehavior="tab"
        disallowTypeAhead
        className="outline-none"
        data-testid="procedures"
      >
        {(item) => (
          <GridListItem
            id={item.id}
            textValue={item.label}
            className={cn(
              "relative outline-none data-[allows-dragging]:select-none data-[allows-dragging]:[-webkit-touch-callout:none] [&_input]:select-text data-[dragging]:opacity-40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-inset",
            )}
            data-point={item.point}
          >
            {item.node}
          </GridListItem>
        )}
      </GridList>
    </div>
  );
}
