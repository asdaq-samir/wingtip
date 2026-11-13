import { useCallback, useEffect, useRef } from "react";
import { FloatingCard } from "../FloatingCard";
import { dropCard, floatLayer, ridingOver, setCard, topCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import { answerClose } from "./cardClose";

/**
 * The cards that float over the map and its sheet (the owner, 2026-11-13:
 * "Except for airport card, redesign the others as recommended"), each the
 * stock Dialog in the one floating shell You has (FloatingCard): a map
 * card, a route leg, a fix, a NOTAM, an airplane's form, the Map card,
 * Emergency. The last opened on top, one opened from another -- or from an
 * airport's card, which rides the sheet (CardStack) -- floating over it,
 * and its close going back to it. The sheet under them stays as it was:
 * its size, its search, its list.
 *
 * Drawn beside the sheet's Drawer, never in it, so Base UI counts none of
 * them as a drawer nested over the sheet (whose content would give way);
 * the content is drawn where its caller is and put in the card's scroller
 * (useCardFrame), as a riding card's is.
 */
export function FloatingCards() {
  const stack = useSheetCards((s) => s.stack);
  const top = topCard(stack);
  return stack
    .filter((entry) => entry.float && !entry.own)
    .map((entry) => (
      <Floating
        key={entry.id}
        entry={entry}
        top={entry.id === top}
        layer={floatLayer(stack, entry.id)}
        covered={ridingOver(stack, entry.id)}
      />
    ));
}

function Floating({ entry, top, layer, covered }: { entry: CardEntry; top: boolean; layer: number; covered: boolean }) {
  const { id, frame, state } = entry;
  const slot = useCallback((node: HTMLElement | null) => setCard(id, { slot: node }), [id]);
  const open = state === "open";
  // Its caller gone before its dialog ever opened: nothing to close, so
  // nothing tells it closed (onOpenChangeComplete); taken away here.
  const opened = useRef(false);
  useEffect(() => {
    if (open) opened.current = true;
    else if (state === "leaving" && !opened.current) dropCard(id);
  }, [open, state, id]);
  return (
    <FloatingCard
      // Put away, kept, while an airport's card opened from it rides the
      // sheet under the floating ones (ridingOver).
      open={open && !covered}
      onOpenChange={(now, details) => {
        if (!now) answerClose(frame, top, details);
      }}
      onOpenChangeComplete={(now) => {
        if (!now && state === "leaving") dropCard(id);
      }}
      label={frame.label}
      labelledBy={frame.labelledBy}
      testId={frame.testId}
      initialFocus={frame.initialFocus ?? false}
      finalFocus={frame.finalFocus ?? false}
      tall={entry.fullScreen}
      instant={state === "leaving"}
      layer={Math.max(0, layer)}
      card
      scrollRef={slot}
    />
  );
}
