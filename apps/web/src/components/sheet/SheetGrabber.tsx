import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "cn";
import type { PanelState } from "../../lib/mapChrome";
import type { SheetPages } from "./SheetPager";

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/** The grabber's box: 56 by 24 to a finger, as iOS's grabber takes a drag
 *  well round its bar (the sheet audit's F-SC1: it was 96 by 10), at the
 *  sheet's free edge: the top of a bottom sheet, the foot of a top sheet
 *  or the side panel. */
const BOX = "absolute inset-x-0 z-30 mx-auto flex h-6 w-14 print:hidden";
const edge = (at: "top" | "bottom") => (at === "top" ? "top-0 items-start pt-1" : "bottom-0 items-end pb-1.25");
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/** The sheet's sizes from the grabber: a tap cycles them, small to big and
 *  back; the Up and Down arrows step them, for a keyboard and VoiceOver. */
function useSizes(size: PanelState, ask: (s: PanelState) => void) {
  const [was, setWas] = useState(size);
  const [rising, setRising] = useState(true);
  if (size !== was) {
    setWas(size);
    setRising(RANK[size] > RANK[was]);
  }
  const cycle = () => ask(size === "peek" || size === "full" ? "half" : rising ? "full" : "peek");
  const arrows = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowUp" && size !== "full") ask(size === "peek" ? "half" : "full");
    else if (event.key === "ArrowDown" && size !== "peek") ask(size === "full" ? "half" : "peek");
    else return;
    event.preventDefault();
  };
  return { cycle, arrows };
}

/**
 * iOS's grabber, 36 by 5. A finger drags the sheet from it (the Drawer's
 * own swipe); tapped it cycles the heights and the arrow keys step them.
 *
 * With the sheet's pages (SheetPager) it is split in two, the owner's
 * (2026-11-11: "Can the grabber itself be split into two to behave as dots
 * do for carousel?"): two bars the same 36 points across in all, Search's
 * and FPL's, the page up in the grabber's strong colour. It is Base UI's
 * Tabs: a tap on the other bar, or Left and Right, picks its page; a tap
 * on the page up's bar sizes the sheet as the whole grabber did, and Up
 * and Down still step it. Each bar's 44-point hit area (its ::after) grows
 * off the sheet's edge, not over the first row, the two meeting in the
 * middle; the bars never grow.
 */
export function SheetGrabber({
  label,
  size,
  ask,
  at,
  pages,
}: {
  label: string;
  size: PanelState;
  ask: (s: PanelState) => void;
  at: "top" | "bottom";
  /** The sheet's pages, for the split grabber; none on a card's own. */
  pages?: Pick<SheetPages, "at" | "go" | "names">;
}) {
  const { cycle, arrows } = useSizes(size, ask);
  const hint = useId();
  if (!pages)
    return (
      <button
        type="button"
        aria-label={label}
        aria-expanded={size !== "peek"}
        data-testid="sidebar-trigger-button"
        onClick={cycle}
        onKeyDown={arrows}
        // Its hit area no more than its box, so what is under it -- the
        // title row's ends, the field all the way up -- is clear of it.
        className={cn(BOX, edge(at), RING, "justify-center rounded-full", "after:inset-x-0! after:top-0! after:bottom-0!")}
      >
        <span className="h-[5px] w-9 rounded-full bg-muted-foreground/40" aria-hidden="true" />
      </button>
    );
  const { names } = pages;
  return (
    <Tabs.Root value={pages.at} onValueChange={(value) => pages.go(Number(value))} className={cn(BOX, edge(at))}>
      {/* Read with each bar: what a tap on the page up's bar does. */}
      <span id={hint} className="sr-only">
        {`${label}. The page up's bar sizes the sheet; Up and Down arrows too.`}
      </span>
      {/* Picked as focused: Left and Right switch the pages at once, as the dots did. */}
      <Tabs.List aria-label={`${label} pages`} activateOnFocus className="flex h-full w-full">
        {names.map((name, i) => {
          const up = i === pages.at;
          return (
            <Tabs.Tab
              key={name}
              value={i}
              aria-label={`${name}, page ${i + 1} of ${names.length}`}
              aria-describedby={hint}
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
              aria-expanded={up ? size !== "peek" : undefined}
              data-page-bar={i}
              // The page up's bar is the grabber the specs and a drag hold.
              data-testid={up ? "sidebar-trigger-button" : undefined}
              onClick={up ? cycle : undefined}
              onKeyDown={arrows}
              className={cn(
                "group/bar relative flex h-full flex-1 rounded-full",
                at === "top" ? "items-start" : "items-end",
                RING,
                // Two 16-point bars four apart: the grabber's 36 in all.
                i === 0 ? "justify-end pr-0.5" : "justify-start pl-0.5",
                // 44 tall off the sheet's edge, meeting the other's in the middle.
                "after:absolute after:inset-x-0! after:content-['']",
                at === "top" ? "after:-top-5! after:bottom-0!" : "after:top-0! after:-bottom-5!",
              )}
            >
              <span
                // The page up's bar the grabber's grey at full strength, the other lighter.
                className="h-[5px] w-4 rounded-full bg-muted-foreground/30 transition-colors group-data-active/bar:bg-muted-foreground motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
