import { useRef, type ReactNode } from "react";
import { cn } from "cn";
import { useStartAtTop } from "../lib/scrollPlace";

/** The room between a tab page's sections, 24 points: Airport's room, less
 *  the 8 its strip kept under it besides. */
export const TAB_PAGE_GAP = "gap-6";

/**
 * A tab's own page in the map's panel -- Airport's search, its Favorites
 * and Recents; Aircraft's; FPL's Saved; Setup's -- one shell for all of
 * them, at the owner's ask ("consistent look and feel for all tabs"):
 * each had its own, and they told apart on a switch (Aircraft's strip
 * three points under Airport's; sections 32 points apart on Airport, 20
 * on Aircraft and 16 on Setup; the Recents headed in a list's small
 * capitals under the Favorites' title).
 * The sides sixteen in, eight under the head's row -- or, with no head
 * (Setup's), its first section where the search bar starts -- and one gap
 * between its sections (TAB_PAGE_GAP), each a labelled one (PillSection)
 * whose heading is the same on every tab. There at once as its tab is
 * picked: a card that comes in over a tab is SheetCard.
 *
 * It does not scroll on its own: it is laid out whole in the sheet's one
 * scroller (SheetParts), under the sheet's head, which stays pinned as it
 * scrolls. Opened anew it starts at the top (the one scrolling rule); a
 * tab's own place is kept by TabKept.
 */
export default function TabPage({
  testId,
  headless = false,
  children,
}: {
  testId?: string;
  /** No head's row over it (Setup's): it starts where the head would. */
  headless?: boolean;
  children: ReactNode;
}) {
  const page = useRef<HTMLDivElement>(null);
  useStartAtTop(page);
  return (
    <div
      ref={page}
      data-tab-page=""
      data-testid={testId}
      className={cn(
        "flex shrink-0 flex-col px-4 pb-4",
        TAB_PAGE_GAP,
        // Its room over its first line, which a list's pinned head
        // (PinnedHead) reaches up over.
        headless ? "pt-1 [--pinned-room:0.25rem]" : "pt-2 [--pinned-room:0.5rem]",
      )}
    >
      {children}
    </div>
  );
}
