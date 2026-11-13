import { useEffect, useRef } from "react";
import type { MapPage } from "../../lib/mapCard";
import MapCard from "./MapCard";
import MapSettingsPage from "./MapSettingsPage";
import AirportWeatherSettings from "./AirportWeatherSettings";
import { MapAlertsPage, MapSourcesPage } from "./MapSettingsPages";

/**
 * The Map card's page in sight (lib/mapCard): the Map, or one opened
 * from a row over it, in the card's own head and scroller (SheetCard), as
 * the procedures' pages are, its close going back one. A page opened or
 * gone back from starts at its top, the focus on its name, which a screen
 * reader then reads.
 */
export function MapCardBody({ page }: { page: MapPage | undefined }) {
  const at = useRef<HTMLDivElement>(null);
  const shown = useRef(page);
  useEffect(() => {
    if (shown.current === page) return;
    shown.current = page;
    const node = at.current;
    node?.closest("[data-sheet-scroll]")?.scrollTo({ top: 0 });
    node?.closest("[data-sheet-card]")?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
  }, [page]);
  return (
    <div ref={at}>
      {page === "settings" ? (
        <MapSettingsPage />
      ) : page === "airport-weather" ? (
        <AirportWeatherSettings />
      ) : page === "alerts" ? (
        <MapAlertsPage />
      ) : page === "sources" ? (
        <MapSourcesPage />
      ) : (
        <MapCard />
      )}
    </div>
  );
}
