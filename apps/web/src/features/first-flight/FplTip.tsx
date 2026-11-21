import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { usePageToggle } from "../../components/sheet/pageToggle";
import { useIsMobile } from "../../hooks/use-mobile";
import { useMapInsets } from "../../lib/mapChrome";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from "../../components/ui/popover";
import { TEXT } from "../../lib/text";

/**
 * The one tip after the first route (FirstFlight, useFirstFlight; the
 * owner's option A, 2026-11-13): where the flight plan is, one tap away
 * on the round page toggle (PageToggle) saying FPL at the start of the
 * search's row (the owner, 2026-11-20) -- shown while it shows FPL, on Search. The stock Popover
 * (shadcn's on Base UI), anchored to the toggle (sheet/pageToggle) with
 * its arrow at it, from no trigger of its own. Its ✕, a tap outside it or
 * Escape put it away for good; it takes no focus, so the map and the
 * sheet stay the pilot's. Nothing while the toggle shows the magnifier
 * (FPL up) or is not drawn (flying, under Settings), nor with the sheet
 * all the way up, where the toggle is at the screen's top, the tip had no
 * room over it and dropped onto Nearest with its arrow at nothing (the UI
 * audit's B5, 2026-11-17); and once the toggle has been used it is not
 * shown again (PageToggle sees it), the way it points being known.
 * In a side panel (from `md` up) the toggle is at the window's top at
 * every size, at the panel's left edge, with no room over it or beside
 * it: there the tip hangs under it, its arrow up at it, where Base UI
 * turned it down by itself with its arrow drawn at nothing (the nightly
 * of 2026-11-21, first-flight.spec:56 on the desktop: the tip's foot at
 * 193, the toggle's top at 31).
 */
export default function FplTip({ onClose }: { onClose: () => void }) {
  const button = usePageToggle((s) => s.plan);
  const full = useMapInsets((i) => i.up);
  const sidePanel = !useIsMobile();
  // Its left edge at the toggle's own, at the row's start, the rest over
  // the map to the right of it (the owner, 2026-11-20); on a phone over
  // the toggle, in a side panel under it, where there is no room above.
  if (!button || full) return null;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={button}
        side={sidePanel ? "bottom" : "top"}
        align="start"
        sideOffset={12}
        collisionPadding={12}
        initialFocus={false}
        finalFocus={false}
        data-testid="fpl-tip"
        className="w-72 flex-row items-start gap-3 overflow-visible rounded-(--radius-card) py-3 pr-2 pl-4 shadow-overlay"
      >
        {/* Base UI's arrow, placed at the toggle by the Positioner: a square
            turned a quarter, half of it out of the tip's side that faces the toggle. */}
        <PopoverPrimitive.Arrow className="size-3 rotate-45 bg-popover data-[side=bottom]:-top-1.5 data-[side=top]:-bottom-1.5" />
        <div className="min-w-0 flex-1">
          <PopoverTitle className={cn("font-semibold text-foreground", TEXT.row)}>Your flight plan is one tap away</PopoverTitle>
          <PopoverDescription className={cn("mt-0.5", TEXT.detail)}>
            Route, nav log, profile and brief, like your EFB. Tap FPL any time.
          </PopoverDescription>
        </div>
        <CloseButton label="Close the tip" className="-my-1 shrink-0" onClick={onClose} data-testid="fpl-tip-close" />
      </PopoverContent>
    </Popover>
  );
}
