import { useCallback, useRef } from "react";
import { Toggle } from "./ui/toggle";
import { PANEL_FIELD_FILL } from "./panelField";
import { TEXT } from "../lib/text";
import { useConsoleOpen } from "../lib/mapChrome";
import { closeEveryCard } from "../lib/openCards";
import { FPL_TIP, useTips } from "../lib/firstRunTips";
import { keepPlanButton, noteFocus, takeFocus, usePageToggle } from "./sheet/pageToggle";

/**
 * Search's round button to FPL's page (the owner, 2026-11-13: "Why not make
 * the same tab on the right toggle between search and fpl"), at the start of
 * Search's first row, before the field, where the account button was (the
 * account button took its old place over the map, MapControls). It says the
 * word FPL (the owner, 2026-11-20: "Fpl button icon can just say FPL", "I
 * just wanted the route icon replaced by the letters FPL"). FPL's page has
 * no such button: its way back is its Search button (PlanWorkspace) and its
 * ✕ clears the route (ClearRouteButton).
 *
 * The stock Toggle (Base UI's, ui/toggle), never pressed -- a tap goes
 * somewhere, it turns nothing on -- so to a screen reader it is a button
 * whose name says where it goes, and holds the word it shows (WCAG 2.5.3).
 * A 44-point disc in the field's own fill, as iOS 26's round buttons are
 * (the owner, 2026-11-20: "let's do what Apple does"), its own 44 its hit
 * area, the word in the badge's type role from lib/text, in rem like the
 * disc, so it grows with the text and the three capitals stay inside it.
 * Drawn only while Search is up, and not while the pages cannot be turned
 * (flying).
 */
export default function PageToggle() {
  const pages = usePageToggle((s) => s.pages);
  const self = useRef<HTMLElement | null>(null);
  // FPL's word is where the first flight's tip points (FplTip). And
  // drawn after a turn, it takes the focus the other page's held.
  const drawn = useCallback((el: HTMLElement | null) => {
    self.current = el;
    takeFocus(el);
    return keepPlanButton(el);
  }, []);
  if (!pages || pages.at !== 0) return null;
  return (
    <Toggle
      ref={drawn}
      pressed={false}
      // A card over the sheet covers this row; were one opening as it is
      // tapped, it closes them -- You too -- and turns to FPL.
      onPressedChange={() => {
        noteFocus(self.current);
        closeEveryCard();
        useConsoleOpen.getState().setOpen(false);
        pages.go(1);
        // The first flight's tip points at FPL's word (FplTip): once it has
        // been tapped to FPL, the tip has done its work and is not shown
        // again (the UI audit's B5).
        useTips.getState().see(FPL_TIP);
      }}
      aria-label="FPL, show flight plan"
      data-testid="sheet-page-toggle"
      className={`relative size-11 shrink-0 rounded-full p-0 text-foreground print:hidden ${PANEL_FIELD_FILL}`}
    >
      <span aria-hidden="true" className={`font-semibold ${TEXT.badge}`}>
        FPL
      </span>
    </Toggle>
  );
}
