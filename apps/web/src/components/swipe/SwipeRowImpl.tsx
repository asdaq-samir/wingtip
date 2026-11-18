import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { animate, motion, useDragControls, useMotionValue, useMotionValueEvent, useTransform, type PanInfo } from "motion/react";
import { cn } from "cn";
import { Button } from "../ui/button";
import { TEXT } from "../../lib/text";
import { MOTION } from "../../lib/tokens";
import { feel } from "../../lib/haptics";
import { prefersReducedMotion } from "../../lib/motion";
import { FULL_SWIPE, swipeEnd } from "./swipeEnd";

export interface SwipeRowProps {
  /** The button's word, the list's own for it in its menu: "Remove". */
  word: string;
  /** What it does, said by a screen reader: "Remove KDLH from Favorites". */
  label: string;
  /** The same handler as the row's menu's Remove, so its Undo is the same. */
  onRemove: () => void;
  children: ReactNode;
}

/**
 * SwipeRow's swipe, from its own chunk (SwipeRow): React Aria's own iOS
 * List View recipe (react-aria.adobe.com/examples/ios-list) -- Motion's
 * drag on the row, a red button behind it that widens as the row goes --
 * on a list's row, wherever the row is drawn. A swipe to the left uncovers
 * the button; past FULL_SWIPE of the row the button fills it, the finger
 * feels it where the browser can, and letting go there removes the row; a
 * tap on the button does the same; a tap on the row or anywhere else while
 * it is open closes it, as iOS's rows do.
 *
 * A finger or a pen only: a mouse's drag is the row's own (React Aria's
 * drag and drop where the row moves, text selection elsewhere), and a
 * keyboard or VoiceOver has the row's menu, whose Remove is the same.
 * Motion's direction lock leaves an upright drag to the list's scroll and
 * the sheet (`data-base-ui-swipe-ignore="x"`: a sideways drag is the
 * row's, an upright one the Drawer's). A press inside
 * `[data-swipe-row-ignore]` starts no swipe, that part's own sideways
 * gesture (a scrolling line of chips) kept.
 */
export function SwipeRowImpl({ word, label, onRemove, children }: SwipeRowProps) {
  const x = useMotionValue(0);
  const controls = useDragControls();
  const box = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  // A drag just ended: the click it may leave is not the row's tap.
  const dragged = useRef(false);
  // The button widens with the row's travel, never narrower than its word
  // once open (its face's own width).
  const width = useTransform(x, (at) => Math.max(0, -at));
  useMotionValueEvent(x, "change", (at) => {
    const past = !!box.current && -at > box.current.offsetWidth * FULL_SWIPE;
    if (past === full) return;
    setFull(past);
    // A tick as it crosses into a full swipe, as iOS's taptic engine gives.
    if (past) feel("detent");
  });

  const settle = (to: number, velocity = 0) =>
    prefersReducedMotion()
      ? Promise.resolve(x.jump(to))
      : animate(x, to, { type: "spring", bounce: 0, duration: MOTION.page, velocity }).then(() => undefined);

  const close = () => {
    setOpen(false);
    void settle(0);
  };

  const remove = async () => {
    const row = box.current;
    if (!row) return;
    await settle(-row.offsetWidth);
    // Its place closes up before it goes, as iOS's list closes over it.
    if (!prefersReducedMotion()) await animate(row, { height: 0 }, { duration: MOTION.fade });
    onRemove();
    // Still drawn (a list that keeps it, or its Undo already pressed): as it was.
    setOpen(false);
    x.jump(0);
    row.style.height = "";
  };

  // Open, any press elsewhere closes it, and the press goes on to what it was on.
  useEffect(() => {
    if (!open) return;
    const away = (event: globalThis.PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  });

  const start = (event: PointerEvent) => {
    dragged.current = false;
    // A part of the row with a sideways gesture of its own (FPL's opened
    // field, its runway tray scrolling sideways) keeps it: a swipe starting
    // there is never the row's Remove (the owner, 2026-11-17: "it's
    // competing with the remove swipe").
    if ((event.target as Element).closest("[data-swipe-row-ignore]")) return;
    if (event.pointerType !== "mouse") controls.start(event);
  };

  const end = (_: unknown, info: PanInfo) => {
    const row = box.current;
    const reveal = face.current?.offsetWidth ?? 0;
    const rest = swipeEnd(x.get(), info.velocity.x, row?.offsetWidth ?? 0, reveal);
    if (rest === "remove") void remove();
    else if (rest === "open") {
      setOpen(true);
      void settle(-reveal, info.velocity.x);
    } else close();
  };

  return (
    <div ref={box} className="relative overflow-hidden" data-base-ui-swipe-ignore="x" data-swipe-row="">
      {/* As wide as the row has gone, so it is never under the row. */}
      <motion.div
        className="absolute inset-y-0 right-0 flex overflow-hidden bg-destructive"
        style={{ width }}
        // Out of reach until uncovered: the row's menu says Remove to a
        // keyboard and to VoiceOver.
        inert={!open}
      >
        <Button
          variant="plain"
          onClick={() => void remove()}
          aria-label={label}
          data-testid="swipe-remove"
          className={cn(
            "h-full w-full rounded-none bg-destructive px-0 text-white hover:bg-destructive dark:text-background",
            full ? "justify-start" : "justify-end",
            TEXT.row,
          )}
        >
          <span ref={face} className="px-5">
            {word}
          </span>
        </Button>
      </motion.div>
      <motion.div
        drag="x"
        dragListener={false}
        dragControls={controls}
        dragDirectionLock
        dragConstraints={{ right: 0 }}
        dragElastic={{ right: 0 }}
        dragMomentum={false}
        style={{ x }}
        className="relative touch-pan-y"
        onPointerDown={start}
        onDragStart={() => {
          dragged.current = true;
          // As React Aria's recipe does: the press under the finger is
          // cancelled, so the row's tap and its held menu stay still.
          document.dispatchEvent(new globalThis.PointerEvent("pointercancel"));
        }}
        onDragEnd={end}
        onClickCapture={(event) => {
          // The click a drag leaves, or a tap on the open row, closes it
          // and is not the row's.
          if (!dragged.current && !open) return;
          event.preventDefault();
          event.stopPropagation();
          dragged.current = false;
          if (open) close();
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
