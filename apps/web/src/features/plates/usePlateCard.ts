import { useQuery } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { faaWords } from "../../lib/advisories";
import type { TerminalChart } from "../../lib/api/types";
import { CardCloseContext } from "../../lib/map/cards/cardClose";
import { airportQuery, plateQuery } from "../../lib/queryClient";
import { plateKey, useHiddenPlates, usePlateLook } from "./plateLook";

/** The plate's title as its card writes it: the field, then the FAA's
 *  name of the approach in sentence case with its codes kept ("KOSH ILS
 *  or LOC rwy 36", CLAUDE.md's Writing; the engine's faa_words). */
export function plateTitle(airport: string, name: string | null | undefined): string {
  const words = faaWords(name);
  return words ? `${airport} ${words}` : airport;
}

/** The field's d-TPP chart the plate is, by the FAA's own title: what View
 *  Full Screen shows, every page of it, in the app's chart viewer. */
export function chartOf(name: string | null | undefined, charts: TerminalChart[]): TerminalChart | null {
  if (!name) return null;
  const wanted = name.toUpperCase();
  return charts.find((c) => c.kind === "IAP" && c.name.toUpperCase() === wanted) ?? null;
}

/**
 * The plate's card's view model (PlateCard): its title, Hide Plate (the
 * plate off the map, its approach still on the route, the card put away),
 * View Full Screen (the FAA's chart in the app's viewer, where the field
 * lists it), and the plates' look -- annotations, inverted colours and how
 * solid the page is -- kept on this device (usePlateLook).
 */
export function usePlateCard(airport: string, id: string) {
  const close = useContext(CardCloseContext);
  const plate = useQuery(plateQuery(airport, id)).data;
  const place = useQuery(airportQuery(airport)).data;
  const chart = chartOf(plate?.name, place?.procedures ?? []);
  const look = usePlateLook();
  const hidePlate = useHiddenPlates((s) => s.hide);
  const [fullScreen, setFullScreen] = useState(false);
  return {
    title: plateTitle(airport, plate?.name ?? id),
    /** The FAA's PDF of the plate, for the viewer; null till the field's
     *  charts come, or where the d-TPP lists none of that name. */
    chartUrl: chart?.url ?? null,
    fullScreen,
    openFullScreen: () => setFullScreen(true),
    closeFullScreen: () => setFullScreen(false),
    hide: () => {
      hidePlate(plateKey(airport, id));
      close();
    },
    opacity: look.opacity,
    inverted: look.inverted,
    annotations: look.annotations,
    setOpacity: look.setOpacity,
    setInverted: look.setInverted,
    setAnnotations: look.setAnnotations,
  };
}
