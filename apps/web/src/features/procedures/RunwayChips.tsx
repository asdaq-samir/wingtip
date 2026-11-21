import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import { ToggleGroup } from "../../components/ui/toggle-group";
import { centre } from "./centreChip";

/** The value of a choice's "None" (no transition), and a runway line's
 *  with none picked yet: a toggle's value is a string. */
export const NONE = "none";

/**
 * Choices laid out as chips, as iOS's filters are, one of them picked:
 * shadcn's ToggleGroup (Base UI: a group of toggles to a screen reader,
 * the one picked pressed, arrow keys between them), a tap on the one picked keeping it. Each chip is 32
 * high; its 44-point hit area a pseudo-element six round it, meeting its
 * neighbours' across the twelve between them, along a row and between
 * the rows they wrap to, the chip not grown.
 */
export function Chips({
  label,
  value,
  onChange,
  trailing,
  trailingRef,
  enter,
  flushStart = false,
  tray = false,
  children,
}: {
  /** The chips the body of a tray, after its head (TRAY_HEAD). */
  tray?: boolean;
  /** The pull-downs' box, for the line to glide them as it opens. */
  trailingRef?: RefObject<HTMLDivElement | null>;
  /** How the chips come in, the pull-downs after them left out of it. */
  enter?: string;
  /** Its first chip at its start, no room kept before it for the chip's
   *  own tap area: where a control's 44 points end just before it (the
   *  runway line's arrow). */
  flushStart?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** After the chips, sliding with them: a field's procedures' pull-downs
   *  (the owner's "just let it slide with runways"). */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  // The chip chosen in the middle of the line, the runways either side in
  // sight (the owner: "make selected the center one"), as far as it goes
  // where the line does not scroll. Sideways only, as it is picked and
  // whenever the line or its chips change size (9L, O'Hare's eighth, was
  // out of sight again after its first layout, procedures:306); a pilot's
  // own scroll resizes nothing, so it is never undone.
  useEffect(() => {
    const box = row.current;
    if (!box) return;
    let gone = false;
    const show = () => {
      const on = box.querySelector<HTMLElement>("[data-pressed]");
      if (!on) return;
      // After the chips slide in (`enter`): 24 points off before (procedures:307).
      const moving = (on.closest<HTMLElement>("[data-slot=toggle-group]") ?? on.parentElement!).getAnimations({ subtree: true });
      if (moving.length) {
        void Promise.allSettled(moving.map((a) => a.finished)).then(() => !gone && centre(on, box));
        return;
      }
      centre(on, box);
    };
    show();
    const watch = new ResizeObserver(show);
    watch.observe(box);
    if (box.firstElementChild) watch.observe(box.firstElementChild);
    return () => {
      gone = true;
      watch.disconnect();
    };
  }, [value]);
  return (
    // One line, scrolled sideways where the chips are more than fit, at
    // the owner's ask; the padding keeps the chips' and the group's tap
    // areas inside what the scroll clips.
    <div
      ref={row}
      data-slides=""
      className={cn(
        "relative -my-1.5 min-w-0 flex-1 overflow-x-auto overscroll-x-contain py-1.5",
        flushStart ? "-mr-1.5 pr-1.5" : "-mx-1.5 px-1.5",
        trailing && "flex items-center gap-3",
      )}
    >
      <ToggleGroup
        value={[value]}
        onValueChange={(v) => {
          if (v[0]) onChange(v[0]);
        }}
        aria-label={label}
        spacing={3}
        // The group's own 44 a pseudo-element behind it, as Segmented's
        // track has, so a tap just over or under a row of chips is the
        // group's and not the page's (isolate keeps it over what is round).
        className={cn(
          "relative isolate w-max flex-nowrap hit-y-1.5 after:-z-10",
          !trailing && !tray && "min-w-full",
          tray && TRAY_BODY,
          enter,
        )}
      >
        {children}
      </ToggleGroup>
      {trailing && (
        <div ref={trailingRef} className="flex shrink-0 items-center gap-2">
          {trailing}
        </div>
      )}
    </div>
  );
}

/** A tray, the owner's pick for a line that folds (G2): its glyph's head,
 *  the round start of a pale tint capsule, and its chips' body, the rest
 *  of it, hugging them. Two boxes, not one, as the chips scroll sideways
 *  under the head while the line is open: the body goes under the head's
 *  edge, and the tray reads as one. 38 high, the 32 chips three in, in
 *  rem as the chips are, so the two stay one height at a larger text size
 *  (at 19.65 px the 38-pixel head stood 4 short of its body; the HIG
 *  review, 2026-11-21); the
 *  head 44 across at the least ("Land RWY"), so the chip against it takes none of its 44 points
 *  (the iOS audit's P1). */
export const TRAY_HEAD =
  "relative flex h-[2.375rem] min-w-11 shrink-0 items-center justify-center rounded-l-full bg-tint/12 pr-1.5 pl-3 text-tint";
export const TRAY_BODY = "rounded-r-full bg-tint/12 p-0.75 pl-0";
