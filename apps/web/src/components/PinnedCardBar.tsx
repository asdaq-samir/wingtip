import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { TEXT } from "../lib/text";

/**
 * A card's name and its close, pinned at the top of the card as its own
 * large head scrolls away, as Apple Maps folds a place card's title into a
 * compact head with its ✕ (the one scrolling rule, the owner 2026-11-10):
 * the title and the way out always in sight. A sticky line of no height at
 * the card's top, so it takes no room and no tap while the head is in
 * sight. Where the browser runs scroll-driven animations the bar fades in
 * with the scroll itself, frame by frame, and the large title fades and
 * shrinks as it goes (index.css's card-pinned and card-title-fold); else
 * the bar shows once the head (`watched`) has left the card's scroller.
 * Either way its name for the browser tests is card-head-pinned while it
 * shows, and its close `${closeTestId}-pinned`.
 */
export function PinnedCardBar({
  title,
  watched,
  onClose,
  closeTestId,
}: {
  title: ReactNode;
  watched: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeTestId: string;
}) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = watched.current;
    const scroller = node?.closest<HTMLElement>(".overflow-y-auto") ?? null;
    if (!node || !scroller) return;
    const watch = new IntersectionObserver(([entry]) => setPast(!!entry && !entry.isIntersecting), { root: scroller });
    watch.observe(node);
    return () => watch.disconnect();
  }, [watched]);
  // Stuck at the scroller's own top edge, not its padding's: the padding
  // over the card's head (under-head's --under-pad) showed the card's
  // content scrolling by over the bar, under the grabber (the sheet
  // audit's F-SC2).
  return (
    <div
      className="sticky top-[calc(var(--head-room,0px)-var(--under-pad,0px))] z-20 -mx-4 h-0"
      data-testid={`${closeTestId}-bar`}
      data-shown={past || undefined}
    >
      {/* Out of sight, out of reach too: its close inert, not a second
          Close a screen reader or Tab finds behind the card's own (the
          sheet audit's F-A2). */}
      <div
        className="card-pinned flex items-center gap-2 bg-background px-4 py-1.5 shadow-sm in-data-[sheet]:bg-[var(--sheet)]"
        data-testid={past ? "card-head-pinned" : undefined}
        inert={!past}
      >
        <span className={cn("min-w-0 flex-1 truncate font-bold text-foreground", TEXT.title)}>{title}</span>
        <CloseButton onClick={onClose} data-back="" data-testid={`${closeTestId}-pinned`} />
      </div>
    </div>
  );
}
