import { useEffect, useState, type RefObject } from "react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { TEXT } from "../lib/text";

/**
 * A card's name and its close, pinned at the top of the card once its own
 * head has scrolled out of sight, as Apple Maps keeps a place card's title
 * and ✕ (the owner, 2026-11-10): the search no longer sits over a card to
 * be the way out. A sticky line of no height at the card's top, so it
 * takes no room and no tap while the head is in sight; the bar hangs from
 * it only once the head (`watched`) has left the card's scroller.
 */
export function PinnedCardBar({
  title,
  watched,
  onClose,
  closeTestId,
}: {
  title: string;
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
  return (
    <div className="sticky top-[var(--head-room,0px)] z-20 -mx-4 h-0" data-testid={`${closeTestId}-bar`} data-shown={past || undefined}>
      {past && (
        <div className="flex items-center gap-2 bg-background px-4 py-1.5 shadow-sm in-data-[sheet]:bg-[var(--sheet)]">
          <span className={cn("min-w-0 flex-1 truncate font-bold text-foreground", TEXT.title)}>{title}</span>
          <CloseButton onClick={onClose} data-back="" data-testid={`${closeTestId}-pinned`} />
        </div>
      )}
    </div>
  );
}
