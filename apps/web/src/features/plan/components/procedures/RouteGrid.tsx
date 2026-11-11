import { useRef, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Button, DropIndicator, GridList, GridListItem, useDragAndDrop, type Key } from "react-aria-components";
import { cn } from "cn";
import { pointName } from "../../../../lib/identSchema";

/** One row of FPL's route list: a point, a hold, a field's block, a stop
 *  being added. `point`, a typed point's place among the route's, where
 *  it can be moved. */
export type RouteItem = { id: string; label: string; point?: number; node: ReactNode };

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
 */
export function RouteGrid({ items, onMove }: { items: RouteItem[]; onMove?: (from: number, to: number) => void }) {
  const points = new Map(items.flatMap((item) => (item.point === undefined ? [] : [[item.id, item.point] as const])));
  // The row picked up: only a point is put down anywhere.
  const carried = useRef<Key | null>(null);
  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: !onMove,
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": items.find((item) => item.id === key)?.label ?? String(key) })),
    getAllowedDropOperations: () => ["move"],
    onDragStart: (event) => {
      carried.current = [...event.keys][0] ?? null;
    },
    onDragEnd: () => {
      carried.current = null;
    },
    // Beside a point, from a point; never onto a row.
    getDropOperation: (target) =>
      target.type === "item" &&
      target.dropPosition !== "on" &&
      points.has(String(target.key)) &&
      carried.current !== null &&
      points.has(String(carried.current))
        ? "move"
        : "cancel",
    onReorder: ({ keys, target }) => {
      const from = points.get(String([...keys][0]));
      const at = points.get(String(target.key));
      if (from === undefined || at === undefined) return;
      // Before or after the point it was let go beside, counted once the
      // point moved has left its own place.
      const to = (target.dropPosition === "after" ? at + 1 : at) - (from < at ? 1 : 0);
      if (to !== from) onMove?.(from, to);
    },
    // The stock line between the rows where it will go.
    renderDropIndicator: (target) => (
      <DropIndicator
        target={target}
        className={({ isDropTarget }) => cn("-my-px h-0.5 rounded-full outline-none", isDropTarget ? "bg-tint" : "bg-transparent")}
      />
    ),
  });
  return (
    <GridList
      aria-label="The route"
      items={items}
      dragAndDropHooks={dragAndDropHooks}
      keyboardNavigationBehavior="tab"
      disallowTypeAhead
      className="outline-none"
      data-testid="procedures"
    >
      {(item) => (
        <GridListItem
          id={item.id}
          textValue={item.label}
          className="relative outline-none data-[dragging]:opacity-40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-inset"
          data-point={item.point}
        >
          {item.node}
        </GridListItem>
      )}
    </GridList>
  );
}

/** A typed point's grip, at its row's end, as iOS's reorder control is:
 *  React Aria's drag button, dragged by a mouse or a finger, or Enter for
 *  the keyboard's and VoiceOver's drag. A 32-point glyph with its 44-point
 *  area. */
export function PointGrip({ ident }: { ident: string }) {
  return (
    <Button
      slot="drag"
      aria-label={`Move ${pointName(ident)}`}
      data-testid="route-grip"
      data-ident={ident}
      // Its drag the row's, not the stock sheet's.
      data-base-ui-swipe-ignore=""
      className="relative grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground outline-none select-none after:absolute after:-inset-1.5 after:content-[''] data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring"
    >
      <GripVertical className="size-5" aria-hidden />
    </Button>
  );
}
