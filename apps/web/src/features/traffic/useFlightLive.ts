import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePreferences } from "../../lib/preferences";
import { useTracking } from "../../lib/map/position/tracking";
import { alertsLine } from "../../lib/aircraftAlerts";
import { airportQuery } from "../../lib/queryClient";
import { flightQuery, routeQuery } from "../../lib/queryClientTraffic";
import { shortWhen, when } from "../../components/airplane/pastFlightFormat";
import { pastFlightQuery, pastFlightsQuery } from "../../lib/airplane/pastFlightsQuery";
import { aircraftKind } from "../../lib/aircraftKind";
import { useShownStore, useShown } from "../../lib/shown";
import { squawkMeaning } from "./squawks";
import { nameCase } from "./nameCase";
import type { StateBadge } from "./FlightSummary";

/** A field's place, for the trace's sketch, as an airport card asks for it
 *  (the same query, so a card opened on it after has it already): where it
 *  is, and its name and town for the summary's ends. */
const sketchField = (ident: string | null) => ({
  ...airportQuery(ident ?? ""),
  enabled: !!ident,
  select: (field: {
    ident: string;
    lat: number;
    lon: number;
    name?: string | null;
    municipality?: string | null;
    region?: string | null;
  }) => ({
    ident: field.ident,
    lat: field.lat,
    lon: field.lon,
    name: field.name ?? null,
    city: field.municipality ?? null,
    region: field.region ?? null,
  }),
});

/** A field's town, "Chicago, IL", from the sketch's field. */
const townOf = (field: { city?: string | null; region?: string | null; name?: string | null } | null | undefined) =>
  field ? [field.city, field.region?.replace(/^US-/, "")].filter(Boolean).join(", ") || field.name || null : null;

/**
 * What the airplane card says of an airplane's flight by its ICAO address
 * (features/airplane's AirplaneCard), what was the traffic card's own
 * (FlightCard, merged into the one airplane card at the owner's word,
 * 2026-11-26): its last report while the map tracks it, adsb.lol's detail
 * of it, its flight number's route, its flights for the summary's ends,
 * the state badge and the line it shows not heard now. `hex` null asks
 * nothing: an N-number whose registry record gives no address. Seconds-old
 * internet data from adsb.lol's receivers: for knowing what is about, not
 * for avoiding it.
 */
export function useFlightLive(hex: string | null, history: boolean) {
  const latest = useShownStore(useTracking, (s) => (hex && s.latest?.plane.hex === hex ? s.latest : null));
  const { data: detail, isLoading: detailLoading } = useQuery({ ...flightQuery(hex ?? ""), enabled: !!hex, subscribed: useShown() });
  // Its flight number's route, asked once a callsign is heard, with where
  // it is then, to say whether it is flying that route today.
  const callsign = latest?.plane.callsign ?? null;
  const firstAt = latest ? { lat: latest.plane.lat, lon: latest.plane.lon } : null;
  const { data: route, isLoading: routeLoading } = useQuery(routeQuery(callsign, firstAt));
  const flying = route && route.plausible !== false ? route : null;
  const plane = latest?.plane ?? null;
  // What is kept of it, for the airplanes' Recents and Favorites, once it
  // can be named: its registration, else its callsign. An airplane not
  // heard today has no trace to name it: the FAA's record does, and what
  // this browser kept of it (N654FL opened from its tile read "A89C1E",
  // its address, at the owner's report, 2026-10-13).
  const keptBefore = usePreferences(
    (p) => [p.myAircraft, ...p.favoriteAircraft, ...p.recentAircraft].find((a) => !!hex && a?.hex === hex) ?? null,
  );
  const keptName = detail?.registration ?? plane?.registration ?? detail?.faa?.n_number ?? plane?.callsign ?? keptBefore?.name ?? null;
  const keptType = detail?.type ?? plane?.type ?? keptBefore?.type ?? null;
  // Its shape from all that is known of it now (lib/aircraftKind); a
  // string, so the kept airplane is new only when the shape is.
  const keptShape =
    detail?.faa || plane?.category || keptType
      ? aircraftKind({ type: keptType, category: plane?.category, faa: detail?.faa })
      : keptBefore?.kind;
  const kept = useMemo(
    () => (hex && keptName ? { hex, name: keptName, type: keptType, kind: keptShape } : null),
    [hex, keptName, keptType, keptShape],
  );
  useEffect(() => {
    if (kept) usePreferences.getState().addRecentAircraft(kept);
  }, [kept]);
  const name =
    plane?.callsign ?? detail?.registration ?? plane?.registration ?? detail?.faa?.n_number ?? keptBefore?.name ?? hex?.toUpperCase() ?? "";
  // Its US registration, where the FAA's registry holds it: the card is then
  // that N-number's, its Info and Figures with it.
  const usTail = [detail?.registration, plane?.registration].find((r) => !!r && /^N[1-9]/.test(r)) ?? null;
  const tail = detail?.faa?.n_number ?? usTail;
  const squawk = plane?.squawk ?? null;
  const rate = plane?.vertical_fpm ?? 0;
  // What it is in the FAA's registry, "Piper PA-28-140", where no trace today names its type.
  const registered = [detail?.faa?.manufacturer, detail?.faa?.model].filter(Boolean).join(" ") || null;
  const model = detail?.description ? nameCase(detail.description) : (detail?.type ?? plane?.type ?? registered);
  // Its flights (the Flights tab's list, the same question): the newest is
  // the one it is on, or, not heard now, its last -- sketched. Another's
  // only while Other Airplanes is on (lib/airplane/ownAirplane).
  const {
    data: past,
    isError: pastFailed,
    isLoading: pastLoading,
  } = useInfiniteQuery({ ...pastFlightsQuery(hex ?? "", null), enabled: !!hex && history });
  const newest = past?.pages[0]?.flights?.[0] ?? null;
  const last = plane ? null : newest;
  // Where it has flown: today's trace while it is heard, or where it landed
  // today; else its last flight's reports, asked once it is known.
  const today = detail?.trail;
  const lastId = hex && !plane && (today?.length ?? 0) < 2 && last ? last.id : null;
  const { data: lastFlight, isError: lastFailed } = useQuery({ ...pastFlightQuery(hex ?? "", lastId ?? 0), enabled: lastId !== null });
  const flown = lastId !== null ? lastFlight?.points : today;
  const trail = useMemo(() => (flown ?? []).map((p) => ({ lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? null })), [flown]);
  // The sketch's words where there is nothing to draw: its flights not had
  // is not "No flights heard" (the owner's iPhone, 2026-11-13).
  const notHad = pastFailed || lastFailed || (!newest && (past?.pages[0]?.unread_days ?? 0) > 0);
  const sketchNote = !history
    ? "Not heard today"
    : notHad
      ? "Its flights could not be fetched."
      : past
        ? "No flights heard"
        : "Fetching its flights…";
  // Its ends: where its trace says it took off, else its flight number's
  // route's first, and the route's last where it is flying the route; not
  // heard, its last flight's ends.
  const fromIdent = plane
    ? (detail?.departed?.ident ?? route?.airports[0]?.ident ?? null)
    : (last?.origin?.ident ?? detail?.departed?.ident ?? null);
  const toIdent = plane
    ? flying && flying.airports.length > 1
      ? flying.airports.at(-1)!.ident
      : null
    : (last?.destination?.ident ?? null);
  // Its ends still asked for: their lines held from the first frame (the flicker audit's FL-10).
  const pending = !fromIdent && (detailLoading || (plane ? routeLoading : pastLoading));
  const { data: fromField } = useQuery(sketchField(fromIdent));
  const { data: toField } = useQuery(sketchField(toIdent));
  // Its state on the summary's corner: an emergency's code first (AIM
  // 6-2-2, 6-3-4, 6-4-2), else climbing or descending past 300 feet a
  // minute, else level.
  const badge: StateBadge | null = plane
    ? squawk && squawkMeaning(squawk)
      ? { word: squawk, tone: "alarm" }
      : { word: rate >= 300 ? "CLB" : rate <= -300 ? "DES" : "LVL", tone: "air" }
    : null;
  // Not heard now, the one line in the summary's place: where its last
  // flight landed, else when it was last heard, today's trace first (the
  // list is minutes behind the trace).
  const endOfToday = !plane ? (today?.at(-1) ?? null) : null;
  const chip = plane
    ? null
    : last
      ? last.landed && last.destination
        ? `On the ground · landed ${last.destination.ident} ${shortWhen(when(last.on))}`
        : `Last heard ${shortWhen(when(last.on))}`
      : endOfToday
        ? `Last heard ${shortWhen(when(endOfToday.t))}`
        : null;
  const alerts = usePreferences((s) => s.aircraftAlerts);
  const waiting = alertsLine(useMemo(() => alerts.filter((a) => a.hex === hex), [alerts, hex]));
  return {
    latest,
    plane,
    detail,
    detailLoading,
    route,
    name,
    tail,
    model,
    operator: detail?.operator ? nameCase(detail.operator) : null,
    registered,
    kept,
    trail,
    sketchNote,
    pending,
    badge,
    chip,
    /** What the pilot asked to be told of it, while it waits. */
    waiting,
    fromField: fromField ?? null,
    toField: toField ?? null,
    fromEnd: fromIdent ? { ident: fromIdent, place: townOf(fromField) ?? (plane ? (route?.airports[0]?.location ?? null) : null) } : null,
    toEnd: toIdent ? { ident: toIdent, place: townOf(toField) ?? (plane ? (flying?.airports.at(-1)?.location ?? null) : null) } : null,
    // How long it has flown only from its departure: today's first point is
    // when it was first heard, which for a flight heard mid-way read "0m"
    // over Las Vegas to Detroit nearly flown (the owner's screenshot,
    // 2026-11-26, DAL1864).
    startedAt: detail?.departed?.at ?? null,
    departedAt: plane ? (detail?.departed?.at ?? null) : null,
    /** Its airport: the field it left while it is flying. */
    airport: plane ? fromIdent : null,
  };
}

export type FlightLive = ReturnType<typeof useFlightLive>;
