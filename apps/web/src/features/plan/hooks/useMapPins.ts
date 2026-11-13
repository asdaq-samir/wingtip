import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { locateOnOpen, useOwnShipNear } from "../../../lib/map/position/ownShip";
import { useKeptAirport } from "../../../lib/preferences";
import { airportQuery, nearestQuery } from "../../../lib/queryClient";
import type { PlannedRoute } from "./planAddress";
import type { PlanCourse } from "./planTypes";
import type { useAddressCards } from "./usePanelView";

type AddressCards = ReturnType<typeof useAddressCards>;

/**
 * Where the map is brought to (usePlanWorkspace): the pilot's position as
 * the page opens, an airport's card's pin, a departure typed alone, and
 * Nearest's fields with own ship; with where a card measures from.
 */
export function useMapPins({
  place,
  heldPoint,
  nearFrom,
  nearOpen,
  planned,
  course,
}: {
  place: string | null;
  heldPoint: AddressCards["heldPoint"];
  /** The place typed in Nearest's field, where there is one. */
  nearFrom: AddressCards["nearFrom"];
  nearOpen: boolean;
  planned: PlannedRoute;
  course: PlanCourse | null;
}) {
  // The map opens on the pilot's position, as Maps opens on yours
  // (locateOnOpen), a route planned or not, at the owner's ask
  // (2026-11-04: "By default load the sheet on current location"); once,
  // on landing. Not where the address names a field or a point, which is
  // what was opened; a card in the address opens at the pill's size
  // (MapPage).
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current) return;
    landed.current = true;
    if (!place && !heldPoint) void locateOnOpen();
  }, [place, heldPoint]);
  const { data: placeData } = useQuery({ ...airportQuery(place ?? ""), enabled: !!place });
  // Where it is, from the card's answer -- or at once, where this browser
  // keeps where it is (Home, a Favorite, one picked lately): the map and
  // its ring waited on the answer, which on a page just loaded queues
  // behind the page's first requests, and stood on the pilot's position
  // under a card that named a field a thousand miles off. One object
  // while it is the same place, as the map brings itself to it each time
  // it changes.
  const keptPlace = useKeptAirport(place);
  const pinIdent = placeData?.ident ?? place;
  const pinLat = placeData?.lat ?? keptPlace?.lat;
  const pinLon = placeData?.lon ?? keptPlace?.lon;
  const placePin = useMemo(
    () => (pinIdent && pinLat != null && pinLon != null ? { ident: pinIdent, lat: pinLat, lon: pinLon } : null),
    [pinIdent, pinLat, pinLon],
  );
  // A departure typed with no destination yet: the map brought to it, at
  // the owner's screenshot (KBDL in, the map left on the whole country).
  // Not a present position, where the map is already.
  const depAlone = !!planned.dep && !planned.dest && !planned.dep.startsWith("@");
  const { data: depData } = useQuery({ ...airportQuery(`${planned.dep}`), enabled: depAlone });
  const depIdent = depAlone ? (depData?.ident ?? null) : null,
    depLat = depData?.lat,
    depLon = depData?.lon;
  const startPin = useMemo(
    () => (depIdent && depLat != null && depLon != null ? { ident: depIdent, lat: depLat, lon: depLon } : null),
    [depIdent, depLat, depLon],
  );
  // Own ship, near enough to fit the map to Nearest's fields with it.
  const fix = useOwnShipNear();
  // Nearest's fields and own ship, for the map to fit with its card up
  // (RouteMap's FitTo): the card's own question, shared.
  // From the place typed in it where there is one.
  const nearOrigin = nearFrom ?? fix;
  const { data: nearestData } = useQuery({
    ...nearestQuery(nearOrigin?.lat ?? 0, nearOrigin?.lon ?? 0),
    enabled: nearOpen && !!nearOrigin,
  });
  const nearestPoints = useMemo(
    () =>
      nearOrigin && nearestData
        ? [{ ident: nearFrom ? nearFrom.label : "own ship", lat: nearOrigin.lat, lon: nearOrigin.lon }, ...nearestData]
        : null,
    [nearOrigin, nearFrom, nearestData],
  );
  // How far the card's airport is where own ship has no fix: from the
  // route's departure, the course's, or before a route is planned the
  // departure typed alone (the card measures from a fix itself) -- so the
  // card always says how far, as the phones' do ("From KMSN").
  const measuredFrom = useMemo(
    () =>
      course
        ? { point: course.departure, name: course.departure.ident }
        : startPin
          ? { point: { lat: startPin.lat, lon: startPin.lon }, name: startPin.ident }
          : null,
    [course, startPin],
  );
  return { placePin, depAlone, startPin, fix, nearOrigin, nearestPoints, measuredFrom };
}
