import { useCallback, useRef } from "react";
import { useLongPress } from "react-aria/useLongPress";
import { Route, X } from "lucide-react";
import { Toggle } from "./ui/toggle";
import { PANEL_FIELD_FILL } from "./panelField";
import { useConsoleOpen } from "../lib/mapChrome";
import { closeEveryCard } from "../lib/openCards";
import { FPL_TIP, useTips } from "../lib/firstRunTips";
import { keepPlanButton, noteFocus, takeFocus, usePageToggle } from "./sheet/pageToggle";

/**
 * The sheet's two pages, Search and FPL, turned by one round button
 * (the owner, 2026-11-13: "Why not make the same tab on the right toggle
 * between search and fpl") at the end of the sheet's first row, where the
 * account button was, on both pages: after the one search on Search and
 * after the airplane's strip on FPL, the bar between them the same size on
 * either, so a turn changes only what is in the bar (the owner,
 * 2026-11-14: "Swap the fpl toggle and account buttons ... toggling
 * between search and fpl keeps the same-size component with a toggle
 * replacing account"; the account button took the toggle's place over the
 * map, MapControls). `page` is the page it is drawn on, and it is drawn
 * only while that page is up, so there is one in the page.
 *
 * It shows the page a tap goes to, as Apple Maps' 2D/3D button shows the
 * mode it switches to: on Search FPL's route glyph, on FPL the magnifier.
 * The stock Toggle (Base UI's, ui/toggle), never pressed -- a tap goes
 * somewhere, it turns nothing on -- so to a screen reader it is a button
 * whose name says where it goes. A 44-point disc in the field's own fill,
 * as iOS 26's round buttons are (the owner, 2026-11-20: "let's do what
 * Apple does"), its own 44 its hit area. Not drawn while the pages cannot be turned (flying).
 */
/** `onHold`: a long press's own action, FPL's ✕ asking to clear the route
 *  (the owner, 2026-11-20: "With long press on close button, it should ask
 *  clear route"), by React Aria's stock long press (half a second), the
 *  release after it not also a tap. */
export default function PageToggle({ page, onHold }: { page: 0 | 1; onHold?: () => void }) {
  const pages = usePageToggle((s) => s.pages);
  const self = useRef<HTMLElement | null>(null);
  const held = useRef(false);
  const { longPressProps } = useLongPress({
    isDisabled: !onHold,
    accessibilityDescription: onHold ? "Long press to clear the route" : undefined,
    onLongPressStart: () => {
      held.current = false;
    },
    onLongPress: () => {
      held.current = true;
      onHold?.();
    },
  });
  // The keys stay the toggle's own (IconTip's reason: usePress would take
  // Enter and Space and never make them a click).
  const { onKeyDown: _keyDown, onKeyUp: _keyUp, ...holdProps } = longPressProps;
  // FPL's glyph is where the first flight's tip points (FplTip). And
  // drawn after a turn, it takes the focus the other page's held.
  const drawn = useCallback(
    (el: HTMLElement | null) => {
      self.current = el;
      takeFocus(el);
      return page === 0 ? keepPlanButton(el) : undefined;
    },
    [page],
  );
  if (!pages || pages.at !== page) return null;
  const onSearch = page === 0;
  // On FPL a ✕, as Apple Maps' Directions closes with one (the owner,
  // 2026-11-19: "Maybe we can have similar buttons x and share"): it closes
  // the flight plan's page to Search, the route kept; the search itself is
  // the round button beside FPL's floating bar (FplTabBar).
  const Glyph = onSearch ? Route : X;
  return (
    <Toggle
      {...holdProps}
      ref={drawn}
      pressed={false}
      // A card over the sheet covers this row; were one opening as it is
      // tapped, it closes them -- You too -- and turns to the other page.
      onPressedChange={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        noteFocus(self.current);
        closeEveryCard();
        useConsoleOpen.getState().setOpen(false);
        pages.go(onSearch ? 1 : 0);
        // The first flight's tip points at FPL's glyph (FplTip): once it has
        // been tapped to FPL, the tip has done its work and is not shown
        // again (the UI audit's B5).
        if (onSearch) useTips.getState().see(FPL_TIP);
      }}
      aria-label={onSearch ? "Show flight plan" : "Close flight plan"}
      data-testid="sheet-page-toggle"
      data-shows={onSearch ? 1 : 0}
      // FPL's ✕ in the text's colour, as Share's beside it and a card's ✕.
      className={`relative size-11 shrink-0 rounded-full p-0 print:hidden ${onSearch ? "text-tint" : "text-foreground"} ${PANEL_FIELD_FILL}`}
    >
      {/* The ✕ at 24, every card's close's size (CloseButton), lucide's
          cross spanning half its box; FPL's route glyph at 20. */}
      <Glyph className={onSearch ? "size-5" : "size-6"} strokeWidth={1.75} aria-hidden="true" />
    </Toggle>
  );
}
