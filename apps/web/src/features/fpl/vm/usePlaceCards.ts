import { useCallback, useEffect, useState, useEffectEvent } from "react";
import { addressPoint, type Address, type SetAddress } from "../../../lib/address";
import type { PanelState } from "../../../lib/mapChrome";
import { takePlace, useWanted } from "../../../lib/navigation/wanted";
import { useAddressCards } from "../../plan";
import { pickOnMap, useMapPickOwner } from "../../../lib/map/mapPick";

/**
 * The cards over the planner's tabs (usePlanWorkspace): an airport's, the
 * airspace over a point, an airplane's -- the address's (usePanelView) --
 * opened and closed. Each card sizes its own drawer (CardStack: half as
 * one opens from the search or the map, the card rule's 2), and the sheet
 * under it stays where it was, so nothing here sizes the sheet for a card.
 */
export function usePlaceCards({
  address,
  setAddress,
  setPanel,
}: {
  address: Address;
  setAddress: SetAddress;
  setPanel: (state: PanelState) => void;
}) {
  // The cards the address holds -- an airport's, the airspace over a
  // point, Nearest's, an airplane's and its past flight's
  // (usePanelView), the airport's opened here (selectPlace), which the
  // route's Approaches ask for too.
  const cards = useAddressCards(address, setAddress, setPanel);
  const { place, heldPoint, nearOpen, flight, selectFlight } = cards;
  const cardOpen = !!place || !!heldPoint || !!flight;
  // FPL's Brief, a card over it (BriefCard): `?brief=1`, kept for FPL as
  // its other cards are (usePanelView).
  const briefOpen = address.brief;
  // The route's Approaches: the destination's card, opened on them. Which
  // field's, until its card has opened on them (PlaceCard's onStarted).
  const [approachesOf, setApproachesOf] = useState<string | null>(null);
  const selectPlace = useCallback(
    (ident: string | null) => {
      // The Approaches intent belongs to the card it was asked for: another
      // card, or none, drops it, so a card that never answered (or was closed
      // first) does not jump to its approaches when it is next opened.
      setApproachesOf((of) => (of === ident ? of : null));
      if ((ident ?? null) === place && !heldPoint) return;
      // Its card opens half way (PlaceCard's `opens`), from the map, a
      // strip or a list all the way up alike, at the owner's ask ("should
      // have the half layout ... that should expand to full, not the
      // other way around").
      void setAddress({ place: ident || null, at: null });
    },
    [place, heldPoint, setAddress, setApproachesOf],
  );
  // A field's card asked for from anywhere -- its name tapped in the nav
  // log (lib/navigation/wanted) -- opened as a tap on the chart opens it.
  // Listened for as the store changes, not read in a render.
  const selectWanted = useEffectEvent(selectPlace);
  useEffect(
    () =>
      useWanted.subscribe((s) => {
        const ident = s.place && takePlace();
        if (ident) selectWanted(ident);
      }),
    [],
  );
  // An airport's card closed: the card under it, an airplane's or
  // Nearest's, at the size it was left at (its own drawer's).
  const closePlace = useCallback(() => selectPlace(null), [selectPlace]);
  // An airplane's card closed: the place under it as it was.
  const closeFlight = useCallback(() => selectFlight(null), [selectFlight]);
  const selectPlaceOnChart = useCallback(
    (ident: string | null) => {
      // A tap on the chart past Nearest's list leaves it: its own drawer
      // lowers itself to the pill (NearestCard's dismiss), the tab kept.
      // A card closed by a tap on the chart leaves the sheet under it at
      // the size the pilot left it (the owner, 2026-11-11).
      if (!ident && nearOpen && !place) return;
      // One pick at a time on the map (lib/map/mapPick): a field's card,
      // from its mark, a route's chip or a Class B field's, puts every other
      // card and ring away -- the airplane's too, where a list's pick opens
      // over it.
      if (ident) pickOnMap("place");
      selectPlace(ident);
    },
    [selectPlace, nearOpen, place],
  );
  const holdPoint = useCallback(
    (point: { lat: number; lon: number }) => {
      pickOnMap("held");
      void setAddress({ at: addressPoint(point), place: null });
      // A point held on the chart: its card half way (AirspaceCard's `opens`).
    },
    [setAddress],
  );
  // Each put away by another kind's pick or a tap on the chart (GlMapShell).
  useMapPickOwner("place", !!place, closePlace);
  useMapPickOwner("held", !!heldPoint, () => void setAddress({ at: null }));
  return { cards, cardOpen, briefOpen, approachesOf, setApproachesOf, selectPlace, closePlace, closeFlight, selectPlaceOnChart, holdPoint };
}
