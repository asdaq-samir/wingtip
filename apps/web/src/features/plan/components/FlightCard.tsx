import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChartLine, Crosshair } from "lucide-react";
import { cn } from "cn";
import { SheetCard } from "../../../components/SheetCard";
import { CardTitle } from "../../../components/CardTitle";
import FlightWhat from "./FlightWhat";
import { CardPictures, type CardSlide } from "../../../components/CardPictures";
import { PhotoSlide } from "../../../components/PictureSlides";
import { FavoriteTile } from "../../../components/FavoriteTile";
import { PillSection } from "../../../components/Favorites";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";
import { useGeo } from "../../../lib/geo";
import { useOwnFixShown } from "../../../lib/map/position/ownShip";
import { useTracking } from "../../../lib/map/position/tracking";
import { alertsLine } from "../../../lib/aircraftAlerts";
import { planePhotoQuery } from "../lib/planePhoto";
import { airportQuery, flightQuery, routeQuery } from "../../../lib/queryClient";
import { TEXT } from "../../../lib/text";
import { reportedAltitude } from "../../../lib/format";
import AircraftAlertMenu from "./AircraftAlertMenu";
import { squawkMeaning } from "../lib/squawks";
import PastFlights from "./PastFlights";
import { shortWhen, when } from "./pastFlightFormat";
import { pastFlightQuery, pastFlightsQuery } from "./pastFlightsQuery";
import { CardAction } from "../../../components/CardAction";
import { shareOrCopy } from "../../../lib/share";
import { aircraftKind } from "../../../lib/aircraftKind";
import { useShownStore, useShown } from "../../../lib/shown";
import { FlightNow, LiveSketch, type StateBadge } from "./FlightSummary";
import { CardTabPages, CardTabPanel } from "../../../components/CardTabs";
import { CardTabBar, type CardTab } from "../../../components/CardTabBar";
import { AirplaneFacts } from "../../../components/airplane/AirplaneFacts";
import { useCardTab } from "../../../lib/cardTab";
import { useTabScroll } from "../../../lib/tabScroll";
import FlightInfoTab from "./FlightInfoTab";
import { nameCase } from "../lib/nameCase";

/** Its pages: what it is first, as the airport card's Info, then its earlier flights. */
const TABS: CardTab<"info" | "flights">[] = [
  { value: "info", label: "Info" },
  { value: "flights", label: "Flights" },
];

/** A link to the airplane on the planner, shared where the phone can,
 *  copied where it cannot. */
async function shareFlight(name: string, hex: string) {
  try {
    await shareOrCopy({ title: name, url: `${location.origin}/app/plan?flight=${hex}` });
  } catch {
    // Put away, or not allowed: nothing to say.
  }
}

/** A field's place, for the trace's sketch, as an airport card asks for it
 *  (the same query, so a card opened on it after has it already): where it
 *  is, and its name and town for the Now entry's end. */
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
 * An airplane being tracked, as FlightAware's flight page and ForeFlight's
 * traffic card show one, laid out as the airport card is (the owner's A2,
 * 2026-10-29, and C1, 2026-11-14: "make sure the airplane card looks
 * similar to airport card"): its callsign with what it is and who flies it;
 * Follow (the map keeps it in the middle, TrafficGl), Alert, Debrief and
 * the star; its flight in a card (FlightNow); its facts in a sideways strip
 * (AirplaneFacts); its photo and where it has flown as the pictures; then
 * Info (FlightInfoTab) or Flights, its earlier ones, in the glass bar at
 * the card's foot. Seconds-old internet data from adsb.lol's receivers: for
 * knowing what is about, not for avoiding it.
 */
export default function FlightCard({
  hex,
  onClose,
  onOpenPast,
  onOpenAirport,
}: {
  hex: string;
  onClose: () => void;
  /** Opens one of its past flights' own card over this one: a flight from
   *  its list, or the one Debrief is for. */
  onOpenPast: (id: number) => void;
  /** Opens a field's card over this one: an end of its flight tapped. */
  onOpenAirport?: (ident: string) => void;
}) {
  const latest = useShownStore(useTracking, (s) => (s.latest?.plane.hex === hex ? s.latest : null));
  const follow = useTracking((s) => s.follow);
  const fix = useOwnFixShown();
  const { data: detail, isLoading: detailLoading } = useQuery({ ...flightQuery(hex), subscribed: useShown() });
  // Its flight number's route, asked once a callsign is heard, with where
  // it is then, to say whether it is flying that route today.
  const callsign = latest?.plane.callsign ?? null;
  const firstAt = latest ? { lat: latest.plane.lat, lon: latest.plane.lon } : null;
  const { data: route, isLoading: routeLoading } = useQuery(routeQuery(callsign, firstAt));
  const flying = route && route.plausible !== false ? route : null;
  const plane = latest?.plane ?? null;
  const following = follow && !!plane;
  // What is kept of it, for the airplanes' Recents and Favorites,
  // once it can be named: its registration, else its callsign.
  // An airplane not heard today has no trace to name it: the FAA's record
  // does, and what this browser kept of it (My Plane, a Favorite, a recent)
  // -- N654FL opened from its tile read "A89C1E", its address, at the
  // owner's report (2026-10-13), and was kept so.
  const keptBefore = usePreferences((p) => [p.myAircraft, ...p.favoriteAircraft, ...p.recentAircraft].find((a) => a?.hex === hex) ?? null);
  const keptName = detail?.registration ?? plane?.registration ?? detail?.faa?.n_number ?? plane?.callsign ?? keptBefore?.name ?? null;
  const keptType = detail?.type ?? plane?.type ?? keptBefore?.type ?? null;
  // Its shape from all that is known of it now, the registry's record and
  // its transponder's category with its type (lib/aircraftKind); a string,
  // so the kept airplane is new only when the shape is.
  const keptShape =
    detail?.faa || plane?.category || keptType
      ? aircraftKind({ type: keptType, category: plane?.category, faa: detail?.faa })
      : keptBefore?.kind;
  const kept = useMemo(
    () => (keptName ? { hex, name: keptName, type: keptType, kind: keptShape } : null),
    [hex, keptName, keptType, keptShape],
  );
  useEffect(() => {
    if (kept) usePreferences.getState().addRecentAircraft(kept);
  }, [kept]);
  const name =
    plane?.callsign ?? detail?.registration ?? plane?.registration ?? detail?.faa?.n_number ?? keptBefore?.name ?? hex.toUpperCase();
  const geo = useGeo();
  const squawk = plane?.squawk ?? null;
  const meaning = squawkMeaning(squawk);
  const rate = plane?.vertical_fpm ?? 0;
  // What it is in the FAA's registry, "Piper PA-28-140": where no trace
  // today names its type (an airplane not heard now), the registry does,
  // as it names who it is registered to.
  const registered = [detail?.faa?.manufacturer, detail?.faa?.model].filter(Boolean).join(" ") || null;
  const model = detail?.description ? nameCase(detail.description) : (detail?.type ?? plane?.type ?? registered);
  const operator = detail?.operator ? nameCase(detail.operator) : null;
  // Its flights found (Earlier flights' list, the same question): the
  // newest is the one it is on, or, not heard now, its last -- sketched,
  // and what Debrief opens.
  const { data: past, isError: pastFailed, isLoading: pastLoading } = useInfiniteQuery(pastFlightsQuery(hex, null));
  const newest = past?.pages[0]?.flights?.[0] ?? null;
  const current = plane && newest?.in_air ? newest : null;
  const last = plane ? null : newest;
  // Where it has flown: today's trace while it is heard, or where it
  // landed today; else its last flight's reports ("if it's not flying
  // now, sketch the last flight"), asked once it is known.
  const today = detail?.trail;
  const lastId = !plane && (today?.length ?? 0) < 2 && last ? last.id : null;
  const { data: lastFlight, isError: lastFailed } = useQuery({ ...pastFlightQuery(hex, lastId ?? 0), enabled: lastId !== null });
  const flown = lastId !== null ? lastFlight?.points : today;
  const trail = useMemo(() => (flown ?? []).map((p) => ({ lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? null })), [flown]);
  // The sketch's words where there is nothing to draw, said where it
  // happens: its flights not had -- the history's request failed, or
  // adsb.lol's days could not be read -- is not "No flights heard",
  // which N654FL's card claimed while its history was unread (the
  // owner's iPhone, 2026-11-13).
  const notHad = pastFailed || lastFailed || (!newest && (past?.pages[0]?.unread_days ?? 0) > 0);
  const sketchNote = notHad ? "Its flights could not be fetched" : past ? "No flights heard" : "Fetching its flights…";
  // Its ends: where its trace says it took off, else its flight number's
  // route's first, and the route's last where it is flying the route; not
  // heard, its last flight's ends.
  const fromIdent = plane
    ? (detail?.departed?.ident ?? route?.airports[0]?.ident ?? null)
    : (last?.origin?.ident ?? detail?.departed?.ident ?? null);
  const toIdent = plane
    ? flying && flying.airports.length > 1
      ? flying.airports[flying.airports.length - 1]!.ident
      : null
    : (last?.destination?.ident ?? null);
  // Its ends, or its last flight, still asked for: their lines held in the
  // summary from the first frame (FlightNow), as the 48 px they took came in
  // over its figures and the card under them (the flicker audit's FL-10).
  const pending = !fromIdent && (detailLoading || (plane ? routeLoading : pastLoading));
  const { data: fromField } = useQuery(sketchField(fromIdent));
  const { data: toField } = useQuery(sketchField(toIdent));
  // Its state on the summary's corner, at the owner's ask: an emergency's
  // code first (AIM 6-2-2, 6-3-4, 6-4-2), else climbing or descending
  // past 300 feet a minute, else level; not heard, on the ground where its
  // last flight landed.
  // Today's trace ending on the ground says so before its flights' list
  // has the flight (the list is minutes behind the trace).
  const endOfToday = !plane ? (today?.at(-1) ?? null) : null;
  const badge: StateBadge | null = plane
    ? squawk && meaning
      ? { word: squawk, tone: "alarm" }
      : { word: rate >= 300 ? "CLB" : rate <= -300 ? "DES" : "LVL", tone: "air" }
    : last?.landed || (!last && endOfToday && endOfToday.alt_ft == null)
      ? { word: "GND", tone: "ground" }
      : null;
  const chip = plane
    ? null
    : last
      ? last.landed && last.destination
        ? `Landed ${last.destination.ident} ${shortWhen(when(last.on))}`
        : `Last heard ${shortWhen(when(last.on))}`
      : endOfToday
        ? `Last heard ${shortWhen(when(endOfToday.t))}`
        : null;
  const { data: photo } = useQuery(planePhotoQuery(hex));
  // Its airport: the field it left while it is flying, the one it landed
  // at or was last at while it is not.
  const airport = plane ? fromIdent : (last?.destination?.ident ?? last?.origin?.ident ?? null);
  // Debrief: the flight it is on, once its track is in its list, else its last.
  const debriefed = current ?? last;
  const alerts = usePreferences((s) => s.aircraftAlerts);
  const waiting = alertsLine(useMemo(() => alerts.filter((a) => a.hex === hex), [alerts, hex]));
  // The summary's ends: flying, the field it left (or its route's first)
  // and the route's last where it flies it; not heard, its last flight's.
  const fromEnd = fromIdent
    ? { ident: fromIdent, place: townOf(fromField) ?? (plane ? (route?.airports[0]?.location ?? null) : null) }
    : null;
  const toEnd = toIdent ? { ident: toIdent, place: townOf(toField) ?? (plane ? (flying?.airports.at(-1)?.location ?? null) : null) } : null;
  const share = () => void shareFlight(name, hex);
  // Its photo where Planespotters has one, linked to its page as their
  // terms ask, then where it has flown, a swipe across: under its facts,
  // as the airport card's pictures (the owner, 2026-11-09: no photo at the
  // card's top).
  const slides: (CardSlide | null)[] = [
    photo
      ? {
          key: "photo",
          href: photo.link,
          label: `${name}'s photo on Planespotters`,
          testId: "flight-photo-open",
          picture: (
            <PhotoSlide
              src={photo.src}
              alt={name}
              label={`${name}'s photo`}
              // Planespotters' terms: the photographer named beside it.
              credit={`© ${photo.photographer} · Planespotters`}
              testId="flight-photo"
              creditTestId="flight-photo-credit"
            />
          ),
        }
      : null,
    {
      key: "trail",
      label: `Where ${name} has flown`,
      picture: (
        <LiveSketch
          latest={latest}
          points={trail}
          // Its track now, or, not heard, its last flight's last way.
          trackDeg={plane?.track_deg ?? (geo && trail.length > 1 ? geo.bearingDeg(trail.at(-2)!, trail.at(-1)!) : null)}
          from={fromField ?? null}
          to={toField ?? null}
          empty={sketchNote}
        />
      ),
    },
  ];
  // The pill's line, at the owner's pick (P5, 2026-10-29): what the
  // summary says first -- its altitude and ground speed as it writes them
  // while it is heard, else its chip -- and where it is from and bound;
  // behind it the photo, or the tint the head draws where there is none.
  const pillLine = [
    plane?.altitude_ft != null && reportedAltitude(plane.altitude_ft),
    plane?.speed_kt != null && `${Math.round(plane.speed_kt)} kt`,
    !plane && chip,
    fromIdent && toIdent && fromIdent !== toIdent
      ? `${fromIdent} → ${toIdent}`
      : fromIdent
        ? `From ${fromIdent}`
        : toIdent
          ? `To ${toIdent}`
          : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Its tab kept while the page is open (useCardTab), on Flights back from a past flight; each its own scroll.
  const [tab, setTab] = useCardTab<"info" | "flights">(`flight:${hex}`, "info");
  const [, setTop] = useTabScroll(tab);
  return (
    <SheetCard head={false} testId="flight-card">
      <CardTitle
        title={name}
        testId="flight-head"
        titleTestId="flight-name"
        sub={<FlightWhat what={[model, operator].filter(Boolean).join(" · ")} />}
        onClose={onClose}
        onShare={share}
        closeTestId="flight-close"
        shareTestId="flight-share"
        pill={{ line: pillLine || undefined, picture: photo?.src, tint: !photo }}
      />
      <div className="grid grid-cols-4 gap-2 pt-3" data-testid="flight-actions">
        {/* Follow filled, the card's first thing to do; nothing to follow
            where it is not heard now: greyed, not pressed. */}
        <TogglePrimitive
          pressed={following}
          disabled={!plane}
          onPressedChange={(on) => useTracking.setState({ follow: on })}
          render={
            <CardAction
              icon={<Crosshair />}
              label={following ? "Following" : "Follow"}
              filled
              pressed={following}
              testId="flight-follow"
              spoken={following ? `Stop following ${name}` : `Follow ${name} on the map`}
            />
          }
        />
        <AircraftAlertMenu hex={hex} name={name} airborne={!!plane} from={fromField ?? null} to={toField ?? null} />
        <CardAction
          icon={<ChartLine />}
          label="Debrief"
          testId="flight-debrief"
          disabled={!debriefed}
          onClick={() => {
            if (debriefed) onOpenPast(debriefed.id);
          }}
        />
        {/* Its star the row's last tile, as the airport card's, the head
            holding its Share and its close alone (the owner, 2026-11-11). */}
        <FavoriteButton kept={kept} />
      </div>
      {/* What the pilot asked to be told of it, while it waits. */}
      {waiting && (
        <p className={cn("pt-2 text-tint", TEXT.note)} data-testid="flight-alerts-set">
          {waiting}
        </p>
      )}
      {(plane || last || endOfToday || pending) && (
        <FlightNow
          pending={pending}
          latest={latest}
          fields={{ from: fromField ?? null, to: toField ?? null, landed: !!last?.landed }}
          plane={plane}
          badge={badge}
          chip={chip}
          from={fromEnd}
          to={toEnd}
          startedAt={detail?.departed?.at ?? today?.[0]?.t ?? null}
          departedAt={plane ? (detail?.departed?.at ?? null) : null}
          fix={fix}
          onOpenAirport={onOpenAirport}
          airport={airport}
        />
      )}
      {/* Its facts in a strip and its pictures, then its pages under the glass bar at the card's foot,
          as the airport card has them (C1; the owner, 2026-11-14: "make sure the airplane card looks
          similar to airport card"). */}
      <AirplaneFacts record={detail?.faa} type={detail?.type ?? plane?.type ?? null} year={detail?.year} testId="flight-facts" />
      <div className="pt-4">
        <CardPictures slides={slides} label={`${name}: ${photo ? "its photo, and " : ""}where it has flown`} testId="flight-pictures" />
      </div>
      <CardTabPages
        tab={tab}
        onPick={setTab}
        top={setTop}
        bar={<CardTabBar testId="flight-tab-bar" tabTestId="flight-tab-" onPick={setTab} tabs={TABS} />}
      >
        <CardTabPanel value="info">
          <FlightInfoTab hex={hex} plane={plane} detail={detail} detailLoading={detailLoading} registered={registered} route={route} />
        </CardTabPanel>
        {/* The ones before the flight it is on, each replayed (PastFlights), and a day to look back from. */}
        <CardTabPanel value="flights">
          <PillSection title="Earlier flights" testId="flight-earlier">
            <PastFlights
              hex={hex}
              onOpen={onOpenPast}
              nowShown={!!plane}
              untitled
              type={detail?.type ?? plane?.type ?? past?.pages[0]?.type ?? null}
            />
          </PillSection>
        </CardTabPanel>
      </CardTabPages>
    </SheetCard>
  );
}

/** Favorite, which adds the airplane to the Favorites. */
function FavoriteButton({ kept }: { kept: KeptAircraft | null }) {
  const starred = usePreferences((s) => !!kept && s.favoriteAircraft.some((a) => a.hex === kept.hex));
  const toggle = usePreferences((s) => s.toggleFavoriteAircraft);
  return <FavoriteTile on={starred} disabled={!kept} onToggle={() => kept && toggle(kept)} testId="flight-favorite" />;
}
