import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "cn";
import type { PanelState } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { DRAWER_MS } from "./insets";
import { usePageHeading } from "./pageHeading";
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

/** How long the capsule holds the page's name once the page is up: about
 *  a second, the owner's ask (2026-11-11), before it folds back. */
const HOLD_MS = 1000;

/**
 * The capsule over the split grabber (the owner, 2026-11-11: "Can the
 * split grabber dot animate to show search or fpl and then fold to the
 * grabber dot when swiped?"): open while the pager moves (the page it is
 * heading to, from Embla's scroll progress, usePageHeading) and for a
 * second after a page comes up however it was picked, then folded. Not on
 * the first draw: only a change opens it.
 */
function useCapsule(at: number) {
  const heading = usePageHeading((s) => s.heading);
  const [was, setWas] = useState(at);
  const [held, setHeld] = useState(false);
  if (at !== was) {
    setWas(at);
    setHeld(true);
  }
  useEffect(() => {
    if (!held || heading !== null) return;
    const fold = window.setTimeout(() => setHeld(false), HOLD_MS);
    return () => window.clearTimeout(fold);
  }, [held, heading, at]);
  return { open: held || heading !== null, shown: heading ?? at };
}

// The capsule moves as the Drawer itself does, on its own time and curve
// (insets' DRAWER_MS, Base UI's drawer: the owner, 2026-11-11, "Just let the
// drawer do what it does"). Opening, it shows at its bar's size at once and
// grows; folding, it shrinks to its bar's size and goes as the bar comes back.
const DRAWER_MOTION = `${DRAWER_MS}ms var(--motion-drawer-ease)`;
const GROW = `width ${DRAWER_MOTION}, height ${DRAWER_MOTION}`;
const MOVES = { "--grow": GROW, "--fold": `${GROW}, opacity 0s ${DRAWER_MS}ms` } as CSSProperties;
// Each page's capsule grows out of its own bar, on its own side (the owner,
// 2026-11-11: "Can the search and fpl animation stay on their sides rather
// than a shared capsule?"): Search's from the left bar, leftward from the
// grabber's middle; FPL's from the right bar, rightward. The other bar stays.
const CAPSULE = cn(
  "pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-full bg-muted-foreground",
  TEXT.caption,
  "font-semibold whitespace-nowrap text-background",
  // Its bar's 16 by 5 folded; open about 20 tall, wide enough for its name at any text size.
  "h-[5px] w-4 opacity-0 [transition:var(--fold)]",
  "group-data-open/grab:h-[1.8em] group-data-open/grab:opacity-100 group-data-open/grab:[transition:var(--grow)]",
  // Reduce Motion: the name fades in and out at its size, nothing grows
  // (over index.css's stilled transitions, for this fade alone).
  "motion-reduce:h-[1.8em]! motion-reduce:[transition:opacity_var(--motion-fade)]!",
);
/** Where each page's capsule hangs and how wide it opens: the left bar's
 *  ends at the grabber's middle (less the bars' 2-point gap each side), the
 *  right bar's starts there. */
const SIDE = [
  "right-[calc(50%+2px)] group-data-open/grab:w-[4.5em] motion-reduce:w-[4.5em]!",
  "left-[calc(50%+2px)] group-data-open/grab:w-[3.25em] motion-reduce:w-[3.25em]!",
];

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
 * middle; the bars never grow. When the page changes its bar gives way to
 * a capsule with its name in it, on its own side, a second, then folds back
 * (useCapsule).
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
  const page = pages?.at ?? 0;
  const capsule = useCapsule(page);
  // A page picked by a swipe or by the app moves no focus, so the Tabs say
  // nothing of it: the polite live region says its name. A bar picked from
  // the keyboard is said by its own focus, so not again here.
  const list = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLSpanElement>(null);
  const said = useRef(page);
  useEffect(() => {
    if (said.current === page || !pages || !live.current) return;
    said.current = page;
    live.current.textContent = list.current?.contains(document.activeElement) ? "" : (pages.names[page] ?? "");
  }, [page, pages]);
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
    <Tabs.Root
      value={pages.at}
      onValueChange={(value) => pages.go(Number(value))}
      data-open={capsule.open || undefined}
      // The bars' own fold back waits out the Drawer's time too.
      style={{ "--drawer-ms": `${DRAWER_MS}ms` } as CSSProperties}
      className={cn(BOX, edge(at), "group/grab")}
    >
      {/* Read with each bar: what a tap on the page up's bar does. */}
      <span id={hint} className="sr-only">
        {`${label}. The page up's bar sizes the sheet; Up and Down arrows too.`}
      </span>
      <span ref={live} aria-live="polite" className="sr-only" />
      {/* The page's name, grown out of the bars; the bars already say it. */}
      <span
        aria-hidden="true"
        data-testid="grabber-capsule"
        data-side={capsule.shown}
        style={MOVES}
        className={cn(CAPSULE, SIDE[capsule.shown] ?? SIDE[0], at === "top" ? "top-1" : "bottom-1.25")}
      >
        {names[capsule.shown]}
      </span>
      {/* Picked as focused: Left and Right switch the pages at once, as the dots did. */}
      <Tabs.List ref={list} aria-label={`${label} pages`} activateOnFocus className="flex h-full w-full">
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
                // The page up's bar the grabber's grey at full strength, the
                // other lighter; the bar whose capsule is out gives way to it
                // at once and comes back as it finishes folding, the other
                // staying (under Reduce Motion it stays, the capsule fading
                // in over it).
                className={cn(
                  "h-[5px] w-4 rounded-full bg-muted-foreground/30 group-data-active/bar:bg-muted-foreground",
                  i === capsule.shown &&
                    "transition-opacity delay-(--drawer-ms) duration-0 group-data-open/grab:opacity-0 group-data-open/grab:delay-0",
                  "motion-reduce:opacity-100!",
                )}
                aria-hidden="true"
              />
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
