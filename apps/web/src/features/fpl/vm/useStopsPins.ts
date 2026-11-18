import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePreferences } from "../../../lib/preferences";
import { stopsAlongQuery, stopsNearQuery } from "../../../lib/queryClient";
import { kindsOf } from "../../../lib/stopKinds";
import { setCard, useSheetCards } from "../../../lib/sheetCards";
import { pickOnMap, useMapPickOwner } from "../../../lib/map/mapPick";
import { useStopsAlong } from "../../stops";
import type { PlannedRoute } from "../../plan";

/** The Stops card's id among the cards (CardLayer), for its pins' taps. */
export const STOPS_CARD = "stops";

/**
 * The map's Stops (StopsCard) as FPL asks for them (useFplCards): where they
 * are looked for, along the course or round own ship, the fields found
 * pinned on the chart while the card is up, and a pin's tap picking its row.
 */
export function useStopsPins({
  stopsShown,
  routed,
  local,
  planned,
  fix,
  fuelStopPins,
}: {
  /** The Stops card in sight (useFplCards). */
  stopsShown: boolean;
  routed: boolean;
  local: boolean;
  planned: PlannedRoute;
  fix: { lat: number; lon: number } | null;
  /** The suggested fuel stops' pins, which keep their own (useSuggestedStops). */
  fuelStopPins: { ident: string }[];
}) {
  // Where the Stops are looked for: along the course while one is drawn
  // (the owner, 2026-10-26), else round own ship (StopsCard).
  const stopsRoute = useMemo(
    () => (routed && !local && planned.dest ? { dep: planned.dep, dest: `${planned.dest}`, stops: planned.stops.join(",") } : null),
    [routed, local, planned.dep, planned.dest, planned.stops],
  );
  const stopsAt = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon } : null), [fix]);
  const stopsRadius = usePreferences((p) => p.stopsRadiusNm);
  const stopKind = usePreferences((p) => p.stopKind);
  // Along the route or round the pilot, as the sheet's pull-down picks
  // (StopsCard): along it where there is one, until the pilot says.
  const stopsScopePicked = useStopsAlong((st) => st.scope);
  const setStopsScope = useStopsAlong((st) => st.setScope);
  const stopsScope = stopsRoute ? (stopsScopePicked ?? "route") : "near";
  // Asked for as soon as there is a route (or a position), not at the
  // button's tap: the planner reads each field's places and outline from
  // Overture the first time, half a minute for a long route's forty, and
  // the owner waited on it ("why is it taking a long time to see these
  // fly in airports", 2026-10-26). Not for each Routes card swiped past.
  // Pinned only while the sheet is open (the same queries as the sheet's).
  const { data: stopsNear } = useQuery({
    ...stopsNearQuery(stopsAt?.lat ?? 0, stopsAt?.lon ?? 0, stopsRadius),
    enabled: !!stopsAt && (!stopsRoute || stopsScope === "near"),
  });
  const { data: stopsAlong } = useQuery({
    ...stopsAlongQuery(stopsRoute?.dep ?? "", stopsRoute?.dest ?? "", stopsRoute?.stops ?? ""),
    enabled: !!stopsRoute,
  });
  const stopsFound = stopsScope === "route" ? stopsAlong : stopsNear;
  // Each field's stacked pins, the kind picked alone where one is (the
  // owner's "With a kind picked, that kind's pin only"). A suggested fuel
  // stop keeps its own pin, not stacked over (the owner's "when food is
  // shown, don't hide the fuel", 2026-10-26).
  const stopFieldPins = useMemo(
    () =>
      stopsShown && stopsFound
        ? stopsFound.fields.flatMap((f) => {
            const kinds = kindsOf(f).filter((k) => stopKind === "all" || k === stopKind);
            return kinds.length && !fuelStopPins.some((p) => p.ident === f.ident)
              ? [{ ident: f.ident, lat: f.lat, lon: f.lon, kinds }]
              : [];
          })
        : undefined,
    [stopsShown, stopsFound, stopKind, fuelStopPins],
  );
  // A field's pin tapped on the chart: its row picked in the Stops card,
  // the card half way up from its pill so the row is in sight (its own
  // drawer's snap point, as useCardSize sets it), where the tap opened the
  // field's card (the owner, 2026-10-28: the card is a tap on the row's
  // ident away).
  const setStopPicked = useStopsAlong((st) => st.setPicked);
  const stopPicked = useStopsAlong((st) => st.picked);
  // One pick at a time on the map (lib/map/mapPick): the field's row and
  // ring put every other card and ring away, and are put away by theirs.
  useMapPickOwner("stop", !!stopPicked, () => setStopPicked(null));
  const pickStopField = useCallback(
    (ident: string) => {
      pickOnMap("stop");
      setStopPicked(ident);
      const stops = useSheetCards.getState().stack.find((entry) => entry.id === STOPS_CARD);
      if (stops?.at === "peek") setCard(STOPS_CARD, { at: "half" });
    },
    [setStopPicked],
  );
  return { stopsRoute, stopsAt, stopsScope, setStopsScope, stopFieldPins, pickStopField };
}
