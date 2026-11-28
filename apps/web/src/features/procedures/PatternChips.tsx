import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { CollapsibleContent } from "../../components/ui/collapsible";
import { Skeleton } from "../../components/ui/skeleton";
import type { Runway } from "../../lib/api/types";
import { landingRunway, runwayNumber, type RunwayEnd, type WindPick, type Landing, type ProcedureAirport } from "../plan";
import { trafficPattern } from "../../lib/trafficPattern";
import type { EndFit } from "./runwayFit";
import { setRunwayLine, useOpenRunwayLines } from "./fieldsOpen";
import { CHIP } from "./routeListStyle";
import { Chips, NONE, TRAY_BODY } from "./RunwayChips";
import { endChoice, runwayEnds } from "./runwayChoice";

/** Where each runway line's pull-downs stood at its last drawing, by the
 *  line's key, and whether it was open: for them to glide from there as it
 *  opens or folds (PatternChips). */
const trailingStood = new Map<string, { open: boolean; x: number }>();

// A runway's chip the buttons' glass, the one picked tinted glass, at the
// owner's pick of the sketches ("B"). Its runway in its middle: a one-figure
// runway ("4") is narrower than the chip's least width, and sat at its left,
// the room to its right empty (the owner's "Why is there extra space to the
// right of runway 4").
/** The arrow in a folded line's chip, after its words: a tap opens it. */
const FOLDED_ARROW = <ChevronRight className="-mr-1 size-3.5 shrink-0" strokeWidth={2.6} aria-hidden />;

/**
 * A field's traffic pattern, picked by its runway as a chip: the
 * end the wind favours marked with the wind, as the redesign's A had it
 * at the owner's pick, and its head- and crosswind said under the chips
 * (windPick) -- at a departure too, the runway to take off on, at the
 * owner's ask, from the nearest report's wind where the field has none of
 * its own, said as that station's. Drawn on the map as the FAA's Airplane Flying
 * Handbook flies a pattern: the downwind about three-quarters of a mile
 * out, the base 45° from the runway's end, the 45° entry abeam midfield.
 * The side its traffic is flown on and the pattern's altitude are said
 * at the head's end for the runway picked.
 */
export function PatternChips({
  airport: a,
  wind,
  chosen,
  landing,
  note,
  label,
  fitOf,
  onPick,
  trailing,
}: {
  airport: ProcedureAirport;
  /** Each end's fit today, marked on its chip (features/procedures/runwayFit). */
  fitOf: (runway: Runway, end: RunwayEnd) => EndFit | null;
  /** The chips' name to a screen reader, where not the pattern's. */
  label?: string;
  /** How the runway picked is flown -- its pattern's side and height, or
   *  how the approach lands ("Straight in", "Circle to land") -- said in
   *  its chip's name: the info button that showed it is gone, at the
   *  owner's ask ("No need for info button"). */
  note: string | null;
  /** The field's procedures' pull-downs, after the runway picked while the
   *  line is folded, sliding with its runways while it is open. */
  trailing?: ReactNode;
  wind: WindPick | null;
  chosen: string | null;
  landing: Landing | null;
  onPick: (end: string) => void;
}) {
  const ends = runwayEnds(a);
  const into = wind && !wind.calm ? wind.ident : null;
  // With an approach, the chip is the runway landed on: the approach's
  // own, straight in, or another only where the plate publishes circling
  // minimums -- a circle to land (AIM 5-4-20); one circling only may
  // circle to any. The engine's landing_runway says which. No pattern is
  // flown then (PlanWorkspace's patterns).
  const own = landingRunway(landing, null, false);
  const allowed = (id: string) => own.othersAllowed || id === own.runway;
  // Folded to the runway picked, at the owner's ask ("can the runway line
  // collapse to the selected runway?"): its chip alone, a tap on it the
  // whole line again, and a pick folding it back to the new one. None
  // picked yet, the line whole. Kept by field while the page is, not the
  // component: the list is drawn again as the sheet moves between its
  // foot and its body.
  const key = `${a.ident}:${label ?? ""}`;
  const open = useOpenRunwayLines((s) => s.open.includes(key));
  const setOpen = (next: boolean) => setRunwayLine(key, next);
  const chip = (runway: Runway, end: RunwayEnd) => endChoice(runway, end, into, fitOf);
  const picked = chosen !== null ? ends.find((e) => runwayNumber(e.end.ident) === chosen) : undefined;
  // The pull-downs after the runways ("+ Arrival", "+ Approach") glide to
  // where the line puts them as it opens and folds, as the runways slide
  // in, where they jumped there -- and faded and slid in with the runways
  // -- once they came up beside them (the owner's "not as smooth as it
  // used to be before the procedures got moved up"). Where they stood is
  // taken at every render (a scroll of the line is one, `scrolled`), by
  // the line's key, as the line is drawn anew as it opens (its block's
  // runway-line-toggle), and they start from it, by a CSS transition:
  // WebKit's headless WAAPI can stall at its first frame.
  const [, setScrolled] = useState(0);
  const line = useRef<HTMLDivElement>(null);
  const after = useRef<HTMLDivElement>(null);
  const shown = !!picked && !open && a.runways !== null ? "folded" : "open";
  useLayoutEffect(() => {
    // Measured from the field's row, which both the open line and the
    // folded one sit in: folded, the line is laid out in the tray's row
    // (`contents`, below) and has no box of its own to measure from.
    const box = after.current,
      base = line.current?.closest<HTMLElement>('[data-testid="field-part"]') ?? line.current;
    if (!box || !base) {
      trailingStood.delete(key);
      return;
    }
    const x = box.getBoundingClientRect().left - base.getBoundingClientRect().left;
    const was = trailingStood.get(key);
    trailingStood.set(key, { open: shown === "open", x });
    if (!was || was.open === (shown === "open") || Math.abs(was.x - x) < 1) return;
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Never from past the line's right edge: in the open line they can
    // stand beyond it, scrolled out of sight in its own scroller, and
    // gliding in from there they ran the panel sideways past its edge for
    // the glide's 300 ms -- the nav log 434 px wide in a 385 px drawer as
    // the runway picked into the wind folded the line (checkpoints.spec,
    // CI 2026-10-28), the iOS audit's "no sideways scroll in a panel".
    const room = Math.max(0, base.getBoundingClientRect().width - box.getBoundingClientRect().width - x);
    const from = Math.min(was.x - x, room);
    if (Math.abs(from) < 1) return;
    box.style.transition = "none";
    box.style.transform = `translateX(${from}px)`;
    // Laid out from there before the transition back: a call, as the
    // minifier drops a bare read of offsetWidth.
    box.getBoundingClientRect();
    box.style.transition = "transform var(--motion-page) var(--motion-sheet-ease)";
    box.style.transform = "";
  });
  if (shown === "folded" && picked) {
    const c = chip(picked.runway, picked.end);
    return (
      // The pull-downs under the tray where there is no room beside it:
      // a field with an arrival and an approach to add ran the nav log
      // 41 points past a phone's width. Laid out in the tray's own row (`contents`,
      // RunwayTray's `folded`), so where they wrap they start at the line's
      // leading edge, under "Land RWY", not under the runway's chip (the owner took it).
      // Open, they slide with
      // the runways, as before.
      <div ref={line} className="contents" data-testid="procedure-patterns">
        {/* Still the group's choice to a screen reader, picked: the same
            stock ToggleGroup as the open line's, with the one runway in it,
            so VoiceOver says the same group and choice folded or open. A
            tap on it, the one already picked, opens the line rather than
            unpicking it. The tray's body, its head the glyph (the block's
            runway-line-toggle). */}
        <ToggleGroup
          value={[c.id]}
          aria-label={label ?? `${a.ident} ${landing ? "runway" : "traffic pattern"}`}
          // Square where it meets the head, as the open line's body is; 12
          // to the pull-downs beside it (the iOS rule's gap-3), so the
          // runway's area, 3 past the tray, and a pull-down's, 6 round it,
          // do not cross: at 8 KDEN's runway lost 3 of its probes to
          // "+ ARR". A margin, so a pull-down
          // wrapped under it starts at the line's edge.
          // It comes in from its end as the open line comes from its head,
          // the group and not the chip, whose own transition is its colour.
          className={cn(TRAY_BODY, "mr-3 rounded-l-none appear-slide [--appear-from:0.75rem_0]")}
        >
          <ToggleGroupItem
            variant="glass"
            value={c.id}
            onClick={() => setOpen(true)}
            // One line, the wind's mark, the runway and the arrow side by
            // side, the arrow never out under the chip (the owner's
            // screenshot, 2026-10-20): laid out in a row here, not left to
            // the chip's own.
            // Its area from the tray's head to the tray's own right edge, the
            // 3 of padding past the chip: sized to its own 44 across, it
            // stopped at the chip and the tray's 44-point square, 47 across,
            // lost its two corners there above and below, over index.css's rule.
            className={cn(CHIP, "inline-flex items-center gap-0.5 whitespace-nowrap after:left-0 after:-right-[3px]", c.ring)}
            aria-label={`${c.words}${note ? `, ${note}` : ""}, picked: tap for the other runways`}
            data-testid="procedure-pattern"
            data-folded=""
          >
            {c.face}
            {FOLDED_ARROW}
          </ToggleGroupItem>
        </ToggleGroup>
        {/* Each pull-down wrapping on its own where the two do not fit beside
            each other: held as one block, KDEN's "+ ARR" and "+ APCH" ran
            past the card's edge, "+ APCH" cut, on a 375-point phone at the
            owner's 19.65 px (the HIG review, 2026-11-21). */}
        {trailing && (
          <div ref={after} className="flex max-w-full min-w-0 flex-wrap items-center gap-3 self-center">
            {trailing}
          </div>
        )}
      </div>
    );
  }
  return (
    // The chips alone, the wind under the ident, how the runway is flown in its chip's name ("No need for info button").
    <div ref={line} className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="procedure-patterns">
      {a.runways === null || !ends.length ? (
        <>
          {/* The runways' chips in outline while they come, their words for a screen
              reader; none for a field with none to give. The pull-downs wrap under them, never cut to "+ A…". */}
          {a.runways === null && (
            <span role="status" className={cn("flex items-center gap-2", TRAY_BODY)}>
              <span className="sr-only">Fetching the runways…</span>
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} aria-hidden="true" className="h-8 w-11 rounded-full" />
              ))}
            </span>
          )}
          {trailing}
        </>
      ) : (
        // Opened from its fold, the line slides out to the right of the
        // runway picked, at the owner's ask ("smoothly expand to the
        // right"); a scroll on it draws it again (`scrolled`), for its
        // pull-downs to glide from where they stand as it folds. With a
        // runway picked to fold to, the line is the content of its tray's
        // Collapsible (the block's runway-line-toggle), so the head's
        // aria-controls names it.
        <LineContent folds={!!picked}>
          <div className="flex min-w-0 flex-1" onScrollCapture={() => setScrolled((t) => t + 1)}>
            {/* A runway each: no None, at the owner's ask ("Why is none even
                an option?"), as every takeoff and landing is on one -- and
                the chip picked tapped again is no way to unpick it either:
                it folds the line, as a new pick does (the owner, 2026-11-05:
                "The runways should fold when a runway is picked", "Even the
                same one"); the ToggleGroup's "" is that tap. */}
            <Chips
              label={label ?? `${a.ident} ${landing ? "runway" : "traffic pattern"}`}
              value={chosen ?? NONE}
              onChange={(v) => {
                if (v === NONE) return;
                setOpen(false);
                if (v) onPick(v);
              }}
              trailing={trailing}
              flushStart
              tray
              trailingRef={after}
              enter={chosen !== null ? "appear-slide [--appear-from:-0.75rem_0]" : undefined}
            >
              {ends.map(({ runway, end }) => {
                const c = chip(runway, end);
                // An end with no surveyed threshold has no pattern to draw;
                // with an approach, none is drawn, and the end is the approach's
                // own or one it may circle to.
                const drawn = trafficPattern(a.ident, runway, end.ident, a.patternAltitudeFt) !== null;
                const circleNa = !allowed(c.id);
                return (
                  <ToggleGroupItem
                    variant="glass"
                    key={end.ident}
                    value={c.id}
                    disabled={circleNa || (!landing && !drawn)}
                    className={cn(CHIP, c.ring)}
                    aria-label={`${c.words}${circleNa ? `, no circling on the ${landing!.name}` : !landing && !drawn ? ", not surveyed" : ""}`}
                    data-testid="procedure-pattern"
                  >
                    {c.face}
                  </ToggleGroupItem>
                );
              })}
            </Chips>
          </div>
        </LineContent>
      )}
    </div>
  );
}

/** A runway line's open chips, the content of its tray's Collapsible
 *  where the line folds to a runway picked (`folds`); where it does not
 *  (none picked yet) it is the line itself, with nothing to open it. */
function LineContent({ folds, children }: { folds: boolean; children: ReactElement }) {
  return folds ? <CollapsibleContent render={children} /> : children;
}
