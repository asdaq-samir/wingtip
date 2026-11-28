import { useEffect, useEffectEvent } from "react";
import { create } from "zustand";
import type { LatLon } from "../geo";

/**
 * One thing picked on the map at a time (the owner, 2026-11-18: "a new pick replaces the old card").
 * Each kind of
 * thing whose card or ring can be up -- an airport (the address's
 * `place`), a point held (`at`), a VOR (`navaid`), a TFR (`tfr`), an
 * airplane (`flight`), the map's own card (GlMapShell's: a fix, a
 * waypoint, an airspace, the weather, a checkpoint, own ship), the route's
 * point ringed (the Nav Log's selected row), a procedure's fix, a route
 * leg and the Stops' field picked -- says how it is put away while it is up (useMapPickOwner). A pick
 * of one kind puts every other away first (pickOnMap), a tap on the
 * chart itself puts all of them away, and each still replaces itself,
 * so no two cards of different kinds stack and no ring is left on a
 * thing whose card is gone.
 */
export type PickKind = "place" | "held" | "navaid" | "mark" | "tfr" | "flight" | "card" | "point" | "fix" | "leg" | "stop";

const up = new Set<{ kind: PickKind; putAway: () => void }>();

/** A pick of `keep` (one kind, or the kinds picked together: a checkpoint's
 *  card and its ring): every other kind up put away. Null, a tap on the
 *  chart itself: every one. */
export function pickOnMap(keep: PickKind | readonly PickKind[] | null) {
  const kept: readonly PickKind[] = keep === null ? [] : typeof keep === "string" ? [keep] : keep;
  for (const owner of [...up]) if (!kept.includes(owner.kind)) owner.putAway();
}

/** Every kind in `kinds` that is up put away: a card's companions as it
 *  closes (the map card's ring, GlMapShell). */
export function putAwayPicks(kinds: readonly PickKind[]) {
  for (const owner of [...up]) if (kinds.includes(owner.kind)) owner.putAway();
}

/** While `isUp`, how this kind's card or ring is put away by another pick. */
export function useMapPickOwner(kind: PickKind, isUp: boolean, putAway: () => void) {
  const away = useEffectEvent(putAway);
  useEffect(() => {
    if (!isUp) return;
    const owner = { kind, putAway: () => away() };
    up.add(owner);
    return () => {
      up.delete(owner);
    };
  }, [kind, isUp]);
}

/** How close in a thing picked anywhere but on the chart brings the map,
 *  the app's levels (one rule for every kind, the design rules' 14): in close
 *  enough to see a field's runways' pattern, as an airport's card from a
 *  list always did. A thing tapped on the chart keeps the pilot's zoom. */
export const PICK_ZOOM = 9;

/** An area whose card is open, its edge lit in the selection's yellow by
 *  its own layer (TfrGl, WeatherGl, AirspaceGl): its kind and its id there. */
export type PickedArea = { kind: "tfr" | "weather" | "airspace"; id: string };

/**
 * What the map shows picked for the card open, in the one selection colour
 * (CHART.selected, the owner, 2026-11-18): the ring round a point (a VOR,
 * a fix, a waypoint, a PIREP, a wind barb, a checkpoint not chosen; PickedGl
 * draws it) and the area lit (a TFR, an airspace, an AIRMET or SIGMET).
 * Set by the card itself while it is drawn (useRingWhileUp, useAreaWhileUp),
 * so the ring goes as its card goes, however it is put away.
 */
export const useMapRing = create<{ at: LatLon | null; area: PickedArea | null }>(() => ({ at: null, area: null }));

/** The ring round `at` while the card calling it is drawn. */
export function useRingWhileUp(at: LatLon | null) {
  const lat = at?.lat ?? null,
    lon = at?.lon ?? null;
  useEffect(() => {
    if (lat === null || lon === null) return;
    const mine = { lat, lon };
    useMapRing.setState({ at: mine });
    // Taken off only where it is still this card's: the next card's ring
    // may be set before this one's card has gone.
    return () => useMapRing.setState((s) => (s.at === mine ? { at: null } : s));
  }, [lat, lon]);
}

/** The area lit while the card calling it is drawn. */
export function useAreaWhileUp(area: PickedArea | null) {
  const kind = area?.kind ?? null,
    id = area?.id ?? null;
  useEffect(() => {
    if (kind === null || id === null) return;
    const mine = { kind, id };
    useMapRing.setState({ area: mine });
    return () => useMapRing.setState((s) => (s.area === mine ? { area: null } : s));
  }, [kind, id]);
}
