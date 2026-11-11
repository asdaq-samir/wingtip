import { useCallback, useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { usePopups } from "./popupsChunk";
import { TEXT } from "../lib/text";
import { TIPS, unseen, useTips, useWelcomeOpen, type TipSpec } from "../lib/firstRunTips";
import { useTipSight } from "../lib/tipAnchors";

/** How long a tip's control is in view before the tip is offered. */
const SETTLE_MS = 700;

/** In sight and not under anything: the point at its middle is its own.
 *  Not in the panel at rest: there the pill is the tab bar and a strip
 *  under it, and a tip over the strip (the route's figures') covered the
 *  tabs -- a tip waits for the panel to be up. */
function inSight(el: Element): boolean {
  if (el.closest("[data-capsule]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
  if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 0), innerHeight - 1);
  const hit = document.elementFromPoint(x, y);
  return !!hit && (el === hit || el.contains(hit));
}

/** Something else up over the page -- a sheet, a menu, a popover: a tip
 *  waits for it to go. */
const somethingOpen = () =>
  !!document.querySelector(
    "[role='dialog'][data-open], [role='alertdialog'][data-open], [role='menu'], [data-slot='popover-content']:not([data-tip-content])",
  );

/**
 * The planner's first-run tips (lib/firstRunTips), one at a time, as TipKit shows
 * a popover tip: beside its control (`data-tip`) once the control has
 * been in sight a moment and nothing else is up, a light to say it is a
 * tip, and the app's close (CloseButton) at its title row's end, as every
 * sheet has it. Closed, or put away by a tap elsewhere -- the pilot
 * moving on -- it is seen and not offered again on this device. The
 * stock popover, anchored to the control without wrapping it.
 */
export default function TipHost() {
  const seen = useTips((s) => s.seen);
  const see = useTips((s) => s.see);
  // The tip up, and the control it is beside.
  const [current, setCurrent] = useState<{ tip: TipSpec; el: HTMLElement } | null>(null);
  // The tips' controls on the screen now, each registered by itself
  // (useTipAnchor) and watched by an IntersectionObserver.
  const inView = useTipSight((s) => s.inView);
  // None over the welcome, which says its own first words.
  const welcoming = useWelcomeOpen((s) => s.open);
  const waiting = welcoming ? [] : TIPS.filter((t) => unseen(seen, t.id) && (!t.after || seen.includes(t.after)));
  const showing = current && inView.some((v) => v.el === current.el) ? current : null;
  const next = showing ? null : (waiting.find((t) => inView.some((v) => v.id === t.id)) ?? null);
  const nextEl = next ? (inView.find((v) => v.id === next.id)?.el ?? null) : null;

  useEffect(() => {
    if (!next || !nextEl) return;
    // In sight a moment before it is offered -- not a control passing by
    // as the panel moves -- and then only with nothing else up, nothing
    // moving, and the control not under anything; else a moment on, while
    // it stays in view. Not while something moves -- the sheet turning,
    // the map's zoom or pan, each a running animation: the look lays the
    // page out to read where its control is, a layout forced into the
    // move's frames (a probe of the sheet's turns, 2026-11-03). One that
    // runs for ever -- a spinner, the radio's wave -- is no move.
    let timer = 0;
    const offer = () => {
      const moving = document.getAnimations().some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);
      if (moving || somethingOpen() || !inSight(nextEl)) {
        timer = window.setTimeout(offer, SETTLE_MS);
        return;
      }
      setCurrent({ tip: next, el: nextEl });
    };
    timer = window.setTimeout(offer, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [next, nextEl]);

  // Put away, not seen, as its control goes: out of view (the observer:
  // `showing` above), or out of sight under the sheet's clip (the
  // Positioner's anchorHidden).
  const putAway = useCallback(() => setCurrent(null), []);

  const popups = usePopups();
  const done = () => {
    if (current) see(current.tip.id);
    putAway();
  };

  // The popover is on the popups' chunk (popupsChunk); a tip waits for it.
  if (!showing || !popups) return null;
  const { Popover, PopoverContent } = popups;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) done();
      }}
      modal={false}
    >
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        anchor={showing.el}
        onAnchorHidden={putAway}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0.5 p-3"
        initialFocus={false}
        data-tip-content=""
        data-testid="tip"
        aria-label={showing.tip.title}
      >
        <div className="flex items-center gap-3">
          <Lightbulb className="size-5 shrink-0 text-tint" aria-hidden />
          <p className={cn("min-w-0 flex-1 font-semibold", TEXT.row)}>{showing.tip.title}</p>
          <CloseButton label="Close the tip" className="-my-1 -mr-1" onClick={done} data-testid="tip-close" />
        </div>
        {/* Under the title, in line with it past the light. */}
        <p className={cn("pl-8", TEXT.prose)}>{showing.tip.message}</p>
      </PopoverContent>
    </Popover>
  );
}
