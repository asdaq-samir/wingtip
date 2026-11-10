import { useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import IconButton from "./IconButton";
import { SheetCard } from "./SheetCard";
import MapSettings from "./MapSettings";
import WeatherSettings from "./WeatherSettings";

/**
 * The map's own button, first among the map's buttons as Maps' is: its
 * card the map's settings -- the chart and its overlay, what is drawn on
 * it, how it looks and where its data comes from -- where Maps keeps its
 * map's, at the pilot's ask. It was Nearest's place; Nearest is
 * Airport's NEAREST now (its pill).
 *
 * A card in the sheet, on a phone and in a desktop's side panel alike,
 * over the search as a place's card is (the owner, 2026-11-10: "Even
 * overlay is a new card over the search bar", with Apple Maps' Choose Map
 * card on the web): the sheet up half way for it, its name large at the
 * top and its close at the right, which goes back to the sheet and the
 * search as they were. It was a popover by the button from `md` up.
 */
export default function MapSettingsButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton
        ref={button}
        label="Map"
        className="text-foreground"
        data-testid="map-settings-button"
        aria-expanded={open}
        data-popup-open={open ? "" : undefined}
        onClick={() => setOpen(!open)}
      >
        <MapIcon strokeWidth={1.5} className="size-5" />
      </IconButton>
      {open && (
        <SheetCard title="Map" onClose={() => setOpen(false)} testId="map-settings" returnFocus={() => button.current}>
          <MapSettings weather={<WeatherSettings />} />
        </SheetCard>
      )}
    </>
  );
}
