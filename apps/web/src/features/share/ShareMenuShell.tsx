import { useState, type ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { TriggerButton, TriggerFace } from "./ShareTrigger";
import { ResponsivePopover, ResponsivePopoverAnchor } from "../../components/ResponsivePopover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import type { RouteCard } from "../../lib/openCards";

/** How the menu's button looks and where it sits, the same for every card's menu. */
export interface ShellLook {
  /** The route's ••• as a button of FPL's floating bar ("bar", FplTabBar)
   *  or of the flying drawer's tiles ("tile", FplActions), its glyph over
   *  "More" (the owner, 2026-11-17: "move everything to the tab bar with a
   *  ... instead of share"); else the first row's round glyph. */
  look?: "bar" | "tile" | "head";
  align: "start" | "end";
  /** Its button's: the route box's, or the tab bar's over the Brief and
   *  the nav log (TabBar's `routeShare`). */
  testId: string;
}

/** What a card's items are handed: an action run once the menu has gone,
 *  and the review's sheet opened. */
export interface MenuActs {
  /** What an item does once the menu has gone, at Base UI's own word that
   *  its close has finished (onOpenChangeComplete), not after a guessed
   *  150 ms a slow phone ran past: printed, the menu was on the paper. */
  afterMenu: (then: () => void) => () => void;
  /** The review's sheet asked for (Save's review item, the Brief's). */
  askReview: () => void;
}

/**
 * The one menu every card's share sits in (RouteMore, BriefShare,
 * NavLogShare, the profile's): its button, the stock menu, and the
 * review's sheet placed by the button, opened once the menu has gone.
 */
export function ShareMenuShell({
  look,
  align,
  testId,
  card,
  reviewSheet,
  children,
}: ShellLook & {
  card: "route" | RouteCard;
  /** The review's sheet, given the way to put it away. */
  reviewSheet?: (done: () => void) => ReactNode;
  children: (acts: MenuActs) => ReactNode;
}) {
  const [askingReview, setAskingReview] = useState(false);
  const [afterClose, setAfterClose] = useState<{ then: () => void } | null>(null);
  const afterMenu = (then: () => void) => () => setAfterClose({ then });
  const trigger = <TriggerButton look={look} card={card} testId={testId} />;

  return (
    // The review's sheet, from the menu's item, placed by the Share
    // button: opened once the menu has gone (afterClose), as Print is.
    <ResponsivePopover
      open={askingReview}
      onOpenChange={(open, details) => {
        // The review's sheet opens as the Share menu goes, whose focus goes
        // back to its button as it closes: taken for a move outside, it
        // shut the sheet just opened, now and then. A tap outside or
        // Escape still closes it.
        if (!open && details?.reason === "focus-out") return details.cancel();
        setAskingReview(open);
      }}
    >
      <DropdownMenu
        onOpenChangeComplete={(open) => {
          if (open || !afterClose) return;
          setAfterClose(null);
          afterClose.then();
        }}
      >
        <ResponsivePopoverAnchor asChild>
          {/* In FPL's floating bar a button of its Toolbar (FplTabBar),
              in the arrows' roving focus, as the NOTAM filters' menus are. */}
          <DropdownMenuTrigger render={look === "bar" ? <Toolbar.Button render={trigger} /> : trigger}>
            {(!look || look === "head") && <TriggerFace card={card} share={look === "head"} />}
          </DropdownMenuTrigger>
        </ResponsivePopoverAnchor>
        <DropdownMenuContent align={align} className="min-w-56 print:hidden">
          {children({ afterMenu, askReview: afterMenu(() => setAskingReview(true)) })}
        </DropdownMenuContent>
      </DropdownMenu>
      {askingReview && reviewSheet?.(() => setAskingReview(false))}
    </ResponsivePopover>
  );
}
