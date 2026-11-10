import { useCallback, useEffect, useRef, useState, useEffectEvent } from "react";
import type { SetURLSearchParams } from "react-router";
import type { PanelState } from "../../../lib/mapChrome";
import { takePlace, useWanted } from "../../../lib/navigation/wanted";
import { patched } from "../../../lib/useSearchParamsNow";
import { panelNow } from "./panelNow";
import { useAddressCards, type PanelView } from "./usePanelView";

/**
 * The cards over the planner's tabs (usePlanWorkspace): an airport's, the
 * airspace over a point, an airplane's -- the address's (usePanelView) --
 * opened and closed, each close putting the sheet back at the height it
 * had before the card, as Apple Maps does.
 */
export function usePlaceCards({
  searchParams,
  setSearchParams,
  panel,
  setPanel,
}: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  panel: PanelState;
  setPanel: (state: PanelState) => void;
}) {
  // The cards the address holds -- an airport's, the airspace over a
  // point, Nearest's, Aircraft's, an airplane's and its past flight's
  // (usePanelView), the airport's opened here (selectPlace), which the
  // route's Approaches ask for too.
  const cards = useAddressCards(searchParams, setSearchParams, setPanel);
  const { place, heldPoint, nearOpen, flight, selectFlight } = cards;
  const cardOpen = !!place || !!heldPoint || !!flight;
  // FPL's Brief, a card over it (BriefCard): `?brief=1`, kept for FPL as
  // its other cards are (usePanelView).
  const briefOpen = searchParams.get("brief") === "1";
  // A card's own Close puts the sheet back at the height it had before the
  // card opened, as Apple Maps does, not the height the card was dragged
  // to: one pulled all the way up and closed leaves the tab at its pill if
  // that is where it was (the owner's pick, "Do what Apple Maps does").
  // Read while no card is open; a card opening and its height land in one
  // render (setPanel's flushSync carries the card's address too). A card
  // the page opened on had no sheet before it: the pill.
  const panelBeforeCard = useRef(cardOpen || briefOpen ? "peek" : panel);
  useEffect(() => {
    if (!cardOpen && !briefOpen) panelBeforeCard.current = panel;
  }, [cardOpen, briefOpen, panel]);
  // The tab an airplane's card was opened over from the route box's
  // N-number (openAirplaneCard), and the tab setter, set once the tabs
  // are (usePanelView, in the workspace): its close goes back there, FPL,
  // not to Aircraft's list under it (the owner's "when closing the card,
  // it doesn't go back to fpl").
  const airplaneFrom = useRef<PanelView | null>(null);
  const backToView = useRef<(view: PanelView) => void>(() => {});
  const setBackToView = useCallback((go: (view: PanelView) => void) => {
    backToView.current = go;
  }, []);
  const closeCard = useCallback(
    (close: () => void) => {
      close();
      setPanel(panelBeforeCard.current);
    },
    [setPanel],
  );
  // The airport's card under the route, the route flown to from it (Fly
  // Here): where the route's close goes back to, as Maps' layers are.
  const [under, setUnder] = useState<string | null>(null);
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
      setSearchParams(
        (prev) => {
          // Opened half way, from the map, a strip or a list all the way up
          // alike, and dragged up from there, at the owner's ask ("should have
          // the half layout ... that should expand to full, not the other way
          // around"). Put away, the height it was.
          return patched(prev, { place: ident ?? null, at: null, view: ident ? null : undefined });
        },
        { replace: true },
      );
      if (ident) setPanel("half");
      // Put away over Nearest's list: the list again, all the way up where
      // it is drawn.
      else if (nearOpen) setPanel("full");
    },
    [place, heldPoint, nearOpen, setSearchParams, setPanel, setApproachesOf],
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
  // An airplane's airport opened from its card (its airport's tile): the
  // airport's card over the airplane's, and its close back to the
  // airplane's at the height it was, as Maps puts one card back under
  // another -- not at the height before any card, which closeCard keeps.
  const panelUnderAirport = useRef<PanelState | null>(null);
  const openAirportOverFlight = useCallback(
    (ident: string) => {
      panelUnderAirport.current = panelNow.current;
      selectPlace(ident);
    },
    [selectPlace],
  );
  useEffect(() => {
    if (!place) panelUnderAirport.current = null;
  }, [place]);
  const closePlace = useCallback(() => {
    const under = panelUnderAirport.current;
    panelUnderAirport.current = null;
    if (flight && under) {
      selectPlace(null);
      setPanel(under);
    } else closeCard(() => selectPlace(null));
  }, [flight, selectPlace, setPanel, closeCard]);
  // An airplane's card closed: back to the tab it was opened over, where
  // that was another (airplaneFrom), at the height before it (closeCard).
  const closeFlight = useCallback(
    () =>
      closeCard(() => {
        selectFlight(null);
        const from = airplaneFrom.current;
        airplaneFrom.current = null;
        if (from) backToView.current(from);
      }),
    [closeCard, selectFlight],
  );
  const selectPlaceOnChart = useCallback(
    (ident: string | null) => {
      // A tap on the chart past Nearest's list lowers it, the tab kept.
      if (!ident && nearOpen && !place) {
        setPanel("peek");
        return;
      }
      selectPlace(ident);
      if (!ident && (place || heldPoint)) setPanel("peek");
    },
    [selectPlace, nearOpen, place, heldPoint, setPanel],
  );
  const holdPoint = useCallback(
    (point: { lat: number; lon: number }) => {
      setSearchParams(
        (prev) => {
          return patched(prev, { at: `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`, place: null, view: null });
        },
        { replace: true },
      );
      // A point held on the chart: its card half way.
      setPanel("half");
    },
    [setSearchParams, setPanel],
  );
  return {
    cards,
    cardOpen,
    briefOpen,
    setBackToView,
    closeCard,
    under,
    setUnder,
    approachesOf,
    setApproachesOf,
    selectPlace,
    openAirportOverFlight,
    closePlace,
    closeFlight,
    selectPlaceOnChart,
    holdPoint,
  };
}
