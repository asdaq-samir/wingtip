import { useEffect, useRef, useState } from "react";
import { useAddress } from "../../lib/address";
import { closeAirplaneProfile } from "../../lib/airplane/profileStore";
import { useTailLookup } from "../../lib/airplane/lookup";
import { profileOfRegistered } from "../../lib/aircraftChoice";
import { track, useTracking } from "../../lib/map/position/tracking";
import { usePreferences } from "../../lib/preferences";
import { shareOrCopy } from "../../lib/share";
import { useTabScroll } from "../../lib/tabScroll";
import { useFlightLive } from "../traffic/lazy";
import { useAirplaneProfile } from "./useAirplaneProfile";
import { airplaneTabs, type AirplaneTab } from "./airplaneTabs";

/**
 * The one airplane card's view model (MVVM; the owner's design of
 * 2026-11-26, which merged the airplane card and the traffic card): opened
 * by its N-number (`tail`: the one search, a link's `airplane=`, any
 * N-number's ⓘ) or by its ICAO address (`hex`: traffic on the map, a
 * link's `flight=`), each finding the other -- the registry gives an
 * N-number's address, adsb.lol's detail an address's US registration -- so
 * an airplane is one card however it is opened. Its flight in the air is
 * useFlightLive's, its record, flights and figures useAirplaneProfile's.
 */
export function useAirplaneCardModel({
  tail: openTail,
  hex: openHex,
  figures,
}: {
  tail: string | null;
  hex: string | null;
  /** Opened on Figures (lib/airplane/profileStore). */
  figures: boolean;
}) {
  const [, setAddress] = useAddress();
  // Its ICAO address: the one it was opened by, else the registry's for its N-number.
  const registry = useTailLookup(openTail, false);
  const hex = openHex ?? registry.hex;
  const live = useFlightLive(hex);
  // Its N-number: the one it was opened by, else its US registration from the flight's detail.
  const tail = openTail ?? live.tail;
  const vm = useAirplaneProfile(tail ?? "", hex);
  const { card } = vm;
  // Opened by its N-number while the live find has it in the air: tracked,
  // as traffic tapped on the map is, so the card shows its flight -- without
  // the map moving to it, which Track asks for. Once a card, so a Track let
  // go or a tap elsewhere on the map is not undone.
  const tracked = useRef(false);
  const flyingPlane = card.flyingPlane;
  useEffect(() => {
    if (openHex || !flyingPlane || tracked.current) return;
    tracked.current = true;
    track(flyingPlane.hex, flyingPlane);
    useTracking.setState({ follow: false });
    void setAddress({ flight: flyingPlane.hex, past: null });
  }, [openHex, flyingPlane, setAddress]);
  const airborne = !!live.plane || !!flyingPlane;
  const following = useTracking((s) => s.follow) && !!live.plane;
  // Fly This only for an airplane the planner can fly: one whose make and
  // model the engine has a handbook for (registered_profile), or the
  // pilot's own (their list, the plan's airplane) -- not any the registry
  // holds, which offered an A321's Fly This and Figures (the owner's
  // screenshot, 2026-11-26, N606FR).
  const flyable = !!tail && ((!!card.record && profileOfRegistered(card.record) !== null) || vm.owned || vm.flying);
  // Each tab opening at its own top (useTabScroll).
  const [picked, pick] = useState<AirplaneTab | null>(null);
  const { tabs, tab } = airplaneTabs({ hex, tail, flyable, figures, airborne, picked });
  const [, setTop] = useTabScroll(tab);
  const kept = card.kept ?? live.kept;
  const starred = usePreferences((s) => !!kept && s.favoriteAircraft.some((a) => a.hex === kept.hex));
  const title = tail ?? live.name;
  const callsign = live.plane?.callsign?.trim() || null;
  const registration = live.detail?.registration ?? live.plane?.registration ?? null;
  const close = () => {
    closeAirplaneProfile();
    track(null);
    void setAddress({ flight: null, past: null });
  };
  return {
    vm,
    card,
    live,
    hex,
    tail,
    title,
    /** Under its name: its call sign while it flies, what it is, and a foreign registration. */
    sub:
      [
        airborne && callsign !== title ? callsign : null,
        card.line ?? live.model ?? vm.type,
        !tail && registration !== title ? registration : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Type not known",
    airborne,
    following,
    follow: (on: boolean) => useTracking.setState({ follow: on }),
    flyable,
    /** The model its POH may be linked for (features/documents' PohRow): the
     *  registry's make and model, else its profile's type. */
    pohModel: [card.record?.manufacturer, card.record?.model].filter(Boolean).join(" ") || vm.type,
    tabs,
    tab,
    pick,
    setTop,
    kept,
    starred,
    toggleFavorite: () => {
      if (kept) usePreferences.getState().toggleFavoriteAircraft(kept);
    },
    /** The card's link, its N-number's where it has one, shared where the device can, copied where not. */
    share: () =>
      void shareOrCopy({ title, url: `${location.origin}/app/plan?${tail ? `airplane=${tail}` : `flight=${hex}`}` }).catch(() => {
        /* put away, or not allowed: nothing to say */
      }),
    fly: () => {
      vm.fly();
      close();
    },
    close,
    /** One of its past flights' cards, its replay and debrief, over this one (PastFlightCard, `?flight=&past=`). */
    openPast: (id: number) => {
      if (hex) void setAddress({ flight: hex, past: id, place: null, at: null, near: null, nearAt: null, nearName: null });
    },
    /** A field's card over this one: an end of its flight tapped. */
    openAirport: (ident: string) => void setAddress({ place: ident, at: null }),
  };
}

export type AirplaneCardModel = ReturnType<typeof useAirplaneCardModel>;
