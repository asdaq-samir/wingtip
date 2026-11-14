import { Map as MapIcon } from "lucide-react";
import IconButton from "./IconButton";
import { SheetCard } from "./SheetCard";
import SettingsButton from "./SettingsButton";
import { MapCard } from "../features/map-settings";
import { showMapCard, useMapCard } from "../lib/mapCard";

/**
 * The map's own button, first among the map's buttons as Maps' is: its
 * card what is on the map -- the chart, its overlay and the layers --
 * where Maps keeps its map's, at the pilot's ask. It was Nearest's place; Nearest is
 * Airport's NEAREST now (its pill).
 *
 * Whether the card is open is the Map card's own (lib/mapCard), not the
 * button's: the button rides the front sheet's top, a card's once one is
 * open (OnSheetTop), and the card is drawn by MapSettingsCard, outside
 * what rides.
 */
export default function MapSettingsButton() {
  const open = useMapCard((s) => s.open);
  return (
    <IconButton
      label="Map"
      className="text-foreground"
      data-testid="map-settings-button"
      aria-expanded={open}
      data-popup-open={open ? "" : undefined}
      onClick={() => showMapCard(!open)}
    >
      <MapIcon strokeWidth={1.5} className="size-5" />
    </IconButton>
  );
}

/**
 * The Map card: a card in the sheet, on a phone and in a desktop's side
 * panel alike, over the search as a place's card is (the owner,
 * 2026-11-10: "Even overlay is a new card over the search bar", with
 * Apple Maps' Choose Map card on the web): its name at the top and its
 * close at the right, which goes back to the sheet and the search as they
 * were, the focus back on the Map button. Drawn by MapControls, beside
 * what rides the sheet, never inside it. The gear at its head's start
 * opens the app's Settings at its Map group, over this card, its close
 * back here (the owner, 2026-11-13).
 */
export function MapSettingsCard() {
  const open = useMapCard((s) => s.open);
  if (!open) return null;
  return (
    <SheetCard
      title="Map"
      onClose={() => showMapCard(false)}
      testId="map-settings"
      // A settings card: a swipe down closes it (the owner, 2026-11-14).
      swipeCloses
      returnFocus={() => document.querySelector<HTMLElement>('[data-testid="map-settings-button"]')}
      leading={<SettingsButton group="map" />}
      closeButton
    >
      <MapCard />
    </SheetCard>
  );
}
