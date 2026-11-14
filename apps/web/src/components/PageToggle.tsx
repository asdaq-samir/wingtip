import { Route, Search } from "lucide-react";
import { Toggle } from "./ui/toggle";
import { PANEL_FIELD_FILL } from "./panelField";
import { useConsoleOpen } from "../lib/mapChrome";
import { closeEveryCard } from "../lib/openCards";
import { keepPlanButton, usePageToggle } from "./sheet/pageToggle";

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
 * whose name says where it goes. A 36-point disc in the field's own fill,
 * as the account button was, its 44-point area a pseudo-element, never a
 * bigger button. Not drawn while the pages cannot be turned (flying).
 */
export default function PageToggle({ page }: { page: 0 | 1 }) {
  const pages = usePageToggle((s) => s.pages);
  if (!pages || pages.at !== page) return null;
  const onSearch = page === 0;
  const Glyph = onSearch ? Route : Search;
  return (
    <Toggle
      // FPL's glyph is where the first flight's tip points (FplTip).
      ref={onSearch ? keepPlanButton : undefined}
      pressed={false}
      // A card over the sheet covers this row; were one opening as it is
      // tapped, it closes them -- You too -- and turns to the other page.
      onPressedChange={() => {
        closeEveryCard();
        useConsoleOpen.getState().setOpen(false);
        pages.go(onSearch ? 1 : 0);
      }}
      aria-label={onSearch ? "Show flight plan" : "Show search"}
      data-testid="sheet-page-toggle"
      data-shows={onSearch ? 1 : 0}
      className={`relative size-9 shrink-0 rounded-full p-0 text-tint after:absolute after:-inset-1 after:rounded-full after:content-[''] print:hidden ${PANEL_FIELD_FILL}`}
    >
      <Glyph className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </Toggle>
  );
}
