import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { SECTION_TITLE } from "../lib/text";
import SectionTitle from "./SectionTitle";
import { Collapsible, CollapsibleTrigger } from "./ui/collapsible";

// The title as a way somewhere, its 44-point area a pseudo-element eight
// round it (the iOS audit's P1), the chevron in the tint.
const MORE = cn(
  "group relative flex items-center gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2",
  SECTION_TITLE,
);
const CHEVRON = "size-5 text-tint transition-transform";

/**
 * One of a pill's labelled rows, the redesign's pattern at the owner's ask
 * ("make the minimal layout this big, and then design all the tabs"): a
 * title over its strip of tiles -- Saved, Favorites, Recents, Nearest --
 * and anything that acts on the row at its right (`right`: what the strip
 * shows, Aircraft's Map switch).
 *
 * Opened in place (`expanded` given: FirstFew, a field's NOTAMs) it is the
 * stock Collapsible, its title the trigger, its chevron turned down while
 * it is open (`group-data-panel-open`); the rows past the first few are
 * the caller's CollapsibleContent, anywhere in `children`.
 */
export function PillSection({
  title,
  onMore,
  expanded,
  beside,
  right,
  children,
  testId,
}: {
  title: string;
  /** The list in full, the title the way to it with its tinted chevron, every section's alike (the owner: "make saved,
   *  favorites and recents into links ..."); `expanded`, opened in place (FirstFew), its chevron down, a tap closing it. */
  onMore?: () => void;
  expanded?: boolean;
  /** Beside the title: what the strip is of, to change there (Aircraft's
   *  airport asked of). */
  beside?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const opens = onMore && expanded !== undefined;
  const more = testId && `${testId}-more`;
  // Every section's title one style (lib/text SECTION_TITLE: 20 points,
  // medium, decision 0021), its words in the text's colour and the
  // chevron in the tint where it opens the list in full (owner decision
  // 2026-11-10 (decisions page): the search's page had bold 22-point
  // titles in the tint beside these); the plain title SectionTitle itself.
  const head = (
    <div className="flex min-h-7 items-center gap-2">
      {opens ? (
        <CollapsibleTrigger data-testid={more} className={MORE}>
          {title}
          <ChevronRight className={cn(CHEVRON, "group-data-panel-open:rotate-90")} aria-hidden="true" />
        </CollapsibleTrigger>
      ) : onMore ? (
        <button type="button" onClick={onMore} data-testid={more} className={MORE}>
          {title}
          <ChevronRight className={CHEVRON} aria-hidden="true" />
        </button>
      ) : (
        <SectionTitle>{title}</SectionTitle>
      )}
      {beside}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
  // Eight under the title: its 44-point hit area its own.
  const look = "flex min-w-0 flex-col gap-2";
  return opens ? (
    <Collapsible open={expanded} onOpenChange={onMore} className={look} data-testid={testId} render={<section />}>
      {head}
      {children}
    </Collapsible>
  ) : (
    <section className={look} data-testid={testId}>
      {head}
      {children}
    </section>
  );
}
