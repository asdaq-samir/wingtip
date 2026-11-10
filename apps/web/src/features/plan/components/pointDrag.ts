import { useSyncExternalStore, type HTMLAttributes, type RefObject } from "react";
import { isTextDropItem, useDrag, useDrop } from "react-aria-components";

/**
 * Moving a route's points by dragging them, on React Aria's drag and drop
 * (useDrag and useDrop), the route box's pills (RouteBox) and FPL's list's
 * grips (procedures/RouteRows) alike: a mouse or a finger drags them as the
 * browser drags anything, and a keyboard or a screen reader picks one up
 * with Enter, goes from one place to the next with Tab, puts it down with
 * Enter or lets it go with Escape, each step said aloud in React Aria's own
 * words (web.md section 3, WCAG 2.5.7's other half is the point's menu's
 * Move Up and Move Down). It was dnd-kit's, whose keyboard drag said
 * nothing a screen reader could follow and which came as 48 KB of its own.
 * React Aria's DragManager offers a point only to targets of its own kind,
 * so a pill is never put down in the list or a row on the box.
 */

/** What is carried: a point's place among the route's, as text. */
export type PointDragKind = "application/x-wingtip-route-pill" | "application/x-wingtip-route-row";

// Which kind is being dragged now, if any: the list's rows cover
// themselves with a place to drop only while one of theirs is out
// (RouteRows' PointGrip), so the row's own controls take the pointer
// the rest of the time.
let dragging: PointDragKind | null = null;
const listeners = new Set<() => void>();
function setDragging(kind: PointDragKind | null) {
  dragging = kind;
  listeners.forEach((listener) => listener());
}

/** Whether a point of this kind is being dragged. */
export function useDraggingKind(kind: PointDragKind): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => dragging === kind,
  );
}

/** One point moved from one place to another, the rest kept in order. */
export function movePoint<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [moved] = out.splice(from, 1);
  if (moved !== undefined) out.splice(to, 0, moved);
  return out;
}

type Props = Record<string, unknown>;

/** Two sets of an element's props as one: their handlers both run, the
 *  first's first, and their descriptions both read. React Aria's own
 *  mergeProps does this, but it is not exported by react-aria-components. */
export function joinProps(...sets: object[]): HTMLAttributes<HTMLElement> {
  const out: Props = {};
  for (const set of sets) {
    for (const [key, value] of Object.entries(set as Props)) {
      const was = out[key];
      if (typeof was === "function" && typeof value === "function" && /^on[A-Z]/.test(key)) {
        out[key] = (...args: unknown[]) => {
          (was as (...a: unknown[]) => void)(...args);
          (value as (...a: unknown[]) => void)(...args);
        };
      } else if (key === "aria-describedby" && was && value) {
        out[key] = `${was} ${value}`;
      } else if (value !== undefined) {
        out[key] = value;
      }
    }
  }
  return out as HTMLAttributes<HTMLElement>;
}

/**
 * A point that is dragged and dropped on: `dragProps` for what is picked up
 * (focusable, Enter its keyboard way in), `dropProps` for where another is
 * put down, at `dropRef`. The move is made once, at the drop: the point
 * carried from its place to this one's.
 */
export function usePointDrag({
  kind,
  index,
  name,
  dropRef,
  onMove,
  onDragStart,
}: {
  kind: PointDragKind;
  index: number;
  /** The point's name, carried as plain text too. */
  name: string;
  dropRef: RefObject<HTMLElement | null>;
  /** The point at `from` put down here. */
  onMove?: (from: number) => void;
  onDragStart?: () => void;
}) {
  const drag = useDrag({
    isDisabled: !onMove,
    getItems: () => [{ [kind]: String(index), "text/plain": name }],
    getAllowedDropOperations: () => ["move"],
    onDragStart: () => {
      setDragging(kind);
      onDragStart?.();
    },
    onDragEnd: () => setDragging(null),
  });
  const drop = useDrop({
    ref: dropRef,
    isDisabled: !onMove,
    getDropOperation: (types) => (types.has(kind) ? "move" : "cancel"),
    onDrop: async (event) => {
      const item = event.items.find((i) => isTextDropItem(i) && i.types.has(kind));
      if (!item || !isTextDropItem(item)) return;
      const from = Number(await item.getText(kind));
      if (Number.isInteger(from) && from !== index) onMove?.(from);
    },
  });
  return {
    dragProps: drag.dragProps,
    dropProps: drop.dropProps as HTMLAttributes<HTMLElement>,
    isDragging: drag.isDragging,
    isDropTarget: drop.isDropTarget,
  };
}
