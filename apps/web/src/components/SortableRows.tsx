import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Button, GridList, GridListItem, useDragAndDrop } from "react-aria-components";

// Apart from Favorites' strips and tiles, which the first load draws: the
// lists in full that a pilot edits are loaded when one is opened
// (FavoritesList, with its AircraftFavoriteGroups), and React Aria's drag and drop
// with them.

/**
 * The rows a list's handles drag, while the list is being edited: React
 * Aria's GridList with its own drag and drop (web.md section 3), round the
 * rows a ListGroup draws, each a `SortableRow`. A mouse or a finger drags a
 * row by its handle, the list showing where it will go; a keyboard picks
 * the focused row up with Enter, moves it with the arrow keys, puts it down
 * with Enter or lets it go with Escape, and VoiceOver is told each step in
 * React Aria's own words. The move is made once, at the drop. It was
 * dnd-kit's sortable, whose keyboard drag said nothing a reader could use.
 */
export function SortableRows({
  label,
  ids,
  onMove,
  children,
}: {
  /** The list's name, said as the grid's. */
  label: string;
  ids: string[];
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder: ({ keys, target }) => {
      const from = ids.indexOf(String([...keys][0]));
      const at = ids.indexOf(String(target.key));
      if (from < 0 || at < 0) return;
      // Before or after the row it was let go on, counted once the row
      // moved has left its own place.
      const to = (target.dropPosition === "after" ? at + 1 : at) - (from < at ? 1 : 0);
      if (to !== from) onMove(from, to);
    },
  });
  return (
    <GridList aria-label={label} dragAndDropHooks={dragAndDropHooks} className="outline-none" data-testid="sortable-rows">
      {children}
    </GridList>
  );
}

/** One of a `SortableRows`' rows, a hairline over each but the first as
 *  the group's own rows have, dimmed while it is the one dragged. */
export function SortableRow({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <GridListItem
      id={id}
      textValue={label}
      className="relative border-border outline-none not-first:border-t data-[dragging]:opacity-40 data-[drop-target]:bg-tint/10 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-inset"
    >
      {children}
    </GridListItem>
  );
}

/** The handle at the end of a row being edited, React Aria's drag button:
 *  dragged, its row goes with it; to a keyboard or VoiceOver it starts the
 *  row's drag. 36 points, its 44 a pseudo-element round it. */
export function MoveHandle({ label }: { label: string }) {
  return (
    <Button
      slot="drag"
      aria-label={label}
      // Its drag the row's, not the stock sheet's.
      data-base-ui-swipe-ignore=""
      className="relative inline-flex size-9 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none after:absolute after:-inset-1 after:content-[''] hover:bg-muted data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring"
    >
      <GripVertical className="size-5" aria-hidden />
    </Button>
  );
}
