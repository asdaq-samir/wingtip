import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import CloseButton from "../../../components/CloseButton";
import { usePlanTab } from "../../../components/sheet/planTab";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from "../../../components/ui/popover";
import { TEXT } from "../../../lib/text";

/**
 * The one tip after the first route (FirstFlight, useFirstFlight; the
 * owner's option A, 2026-11-13): where the flight plan lives, on the FPL
 * tab. The stock Popover (shadcn's on Base UI), anchored to the tab
 * (sheet/planTab, kept by SheetTabBar) with its arrow at it, from no trigger of its
 * own. Its ✕, a tap outside it or Escape put it away for good; it takes
 * no focus, so the map and the sheet stay the pilot's. Nothing while the
 * tab bar is not drawn (flying, under Settings).
 */
export default function FplTip({ onClose }: { onClose: () => void }) {
  const tab = usePlanTab((s) => s.el);
  if (!tab) return null;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={tab}
        side="top"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        initialFocus={false}
        finalFocus={false}
        data-testid="fpl-tip"
        className="w-72 flex-row items-start gap-3 overflow-visible rounded-(--radius-card) py-3 pr-2 pl-4 shadow-overlay"
      >
        {/* Base UI's arrow, placed at the tab by the Positioner: a square
            turned a quarter, its lower half out under the tip. */}
        <PopoverPrimitive.Arrow className="size-3 rotate-45 bg-popover data-[side=top]:-bottom-1.5" />
        <div className="min-w-0 flex-1">
          <PopoverTitle className={cn("font-semibold text-foreground", TEXT.row)}>Your flight plan lives here</PopoverTitle>
          <PopoverDescription className={cn("mt-0.5", TEXT.detail)}>
            Route, nav log, profile and brief, like your EFB. Tap FPL any time.
          </PopoverDescription>
        </div>
        <CloseButton label="Close the tip" className="-my-1 shrink-0" onClick={onClose} data-testid="fpl-tip-close" />
      </PopoverContent>
    </Popover>
  );
}
