import { Route, Search } from "lucide-react";
import { cn } from "cn";
import { Toggle } from "./ui/toggle";
import { GLASS } from "../lib/mapChrome";
import { keepPlanButton, usePageToggle } from "./sheet/pageToggle";

/**
 * The sheet's two pages, Search and FPL, turned by one round glass button
 * (the owner, 2026-11-13: "Why not make the same tab on the right toggle
 * between search and fpl"), its own circle the same size and glass as the
 * 3D and the microphone's: on a phone riding the sheet's top at the left,
 * under the 3D, where the radio's button was (the owner, 2026-11-13:
 * "replace the radio button on the left with the fpl toggle but below
 * 3d"); from md up under the map's buttons at the right (MapControls). It shows the page a tap goes to, as Apple
 * Maps' 2D/3D button shows the mode it switches to: on Search FPL's route
 * glyph, on FPL the magnifier. The stock Toggle (Base UI's, ui/toggle),
 * never pressed -- a tap goes somewhere, it turns nothing on -- so to a
 * screen reader it is a button whose name says where it goes. Its 44-point
 * area a pseudo-element out to its glass's edge, never a bigger button.
 * Not drawn while the pages cannot be turned (flying, under Settings).
 */
export default function PageToggle() {
  const pages = usePageToggle((s) => s.pages);
  if (!pages) return null;
  const onSearch = pages.at === 0;
  const Glyph = onSearch ? Route : Search;
  return (
    <div data-map-food="" className={cn("flex rounded-full p-1 print:hidden", GLASS)}>
      <Toggle
        // FPL's glyph is where the first flight's tip points (FplTip).
        ref={onSearch ? keepPlanButton : undefined}
        pressed={false}
        onPressedChange={() => pages.go(onSearch ? 1 : 0)}
        aria-label={onSearch ? "Show flight plan" : "Show search"}
        data-testid="sheet-page-toggle"
        data-shows={onSearch ? 1 : 0}
        className="relative size-9 rounded-full text-foreground after:absolute after:-inset-1 after:rounded-full after:content-['']"
      >
        <Glyph className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </Toggle>
    </div>
  );
}
