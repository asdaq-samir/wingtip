import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, useEffectEvent } from "react";
import { usePrefetchQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useKeptAirport } from "../../../lib/preferences";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { shareOrCopy } from "../../../lib/share";
import { CardHead } from "../../../components/CardHead";
import { SheetCard } from "../../../components/SheetCard";
import { PINNED_BELOW } from "../../../components/PinnedHead";
import { CardTitle } from "../../../components/CardTitle";
import { CardPictures, type CardSlide } from "../../../components/CardPictures";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { CardTabBar, CardTabPanel } from "../../../components/CardTabs";
import { Tabs } from "../../../components/ui/tabs";
import { useCardTab } from "../lib/cardTab";
import { useTabScroll } from "../lib/tabScroll";
import PlaceActions, { PlaceFavorite } from "./place/PlaceActions";
import PlaceSubtitle from "./place/PlaceSubtitle";
import { ApiError } from "../../../lib/api/client";
import type { AirportPin, AirportPlace, ClassBAirport } from "../../../lib/api/types";
import { compassPoint } from "../../../lib/compass";
import { distanceNm, type LatLon } from "../../../lib/geo";
import { awayFrom } from "../../../lib/useAway";
import { chipFillOf } from "../../../lib/map/marks/flightCategory";
import { inkOn } from "../../../lib/scoreScale";
import { feet, miles } from "../../../lib/format";
import { reportedWind, windLine } from "../format";
import { FaaChart } from "./AirportDiagram";
import { RunwaySketch } from "./RunwaySketch";
import { runwaysLeftOut, stripsOf } from "../lib/runwaySketch";
import { TEXT } from "../../../lib/text";
import { diagramRunwaysPicture } from "../../../lib/diagram";
import { ago } from "../../../lib/format";
import { useMinuteClock } from "../../../lib/useMinuteClock";
import { prefersReducedMotion } from "../../../lib/motion";
import { arrivalHour, hoursOf, sentenceOf } from "../lib/hourly";
import { sameField } from "../../../lib/procedures";
import { airportQuery, photosQuery, servicesQuery } from "../../../lib/queryClient";
import { StopStrip, type SuggestedStop } from "./StopServices";
import { PhotoSlide } from "../../../components/PictureSlides";
import { PlaceChartsTab } from "./place/PlaceChartsTab";
import { PlaceInfoTab } from "./place/PlaceInfoTab";
import { PlaceRunwaysTab } from "./place/PlaceRunwaysTab";
import { PlaceWeatherTab } from "./place/PlaceWeatherTab";
import { PlaceAlerts } from "./place/PlaceNotams";
import { useShown } from "../../../lib/shown";
import { Badge } from "../../../components/ui/badge";

const SketchViewer = lazy(() => import("./SketchViewer"));
// The pictures behind the diagram, full screen to pinch in on, as a chart is.
const PictureViewer = lazy(() => import("./AirportDiagramViewer"));

/** "18 nm NE", from wherever the card is measured from. */
function away(from: LatLon, to: LatLon): string {
  return distanceNm(from, to) < 0.5 ? "here" : awayFrom(from, to);
}

/** The line under the name, how far the field is at the pilot's ask --
 *  "18 nm NE of C81" -- and whether it may be landed at without asking.
 *  Nothing where there is nothing to measure from, nor where the start is
 *  the field itself: the departure's own card, with no fix, said "here of KMSN", as the phones said "From KMSN 0 nm". */
function subtitleOf(place: AirportPlace, from: { point: LatLon; name: string | null } | null): string {
  const itself = !!from?.name && (sameField(from.name, place.ident) || distanceNm(from.point, place) < 0.5);
  return [
    from && !itself ? (from.name ? `${away(from.point, place)} of ${from.name}` : away(from.point, place)) : null,
    // Its elevation beside the distance, at the owner's ask (2026-10-29):
    // the field's from the FAA's airport file (NASR APT_BASE ELEV, feet MSL), what a pilot sets the pattern altitude from.
    place.elevation_ft != null ? `Elevation ${feet(place.elevation_ft)}` : null,
    // A field the armed services own (the FAA's airport file): one most pilots may not land at without the service's permission, or a civil
    // airport sharing it -- not a description, a field to keep out of.
    place.military === "military"
      ? "Military, permission required"
      : place.military === "joint"
        ? "Joint use"
        : place.private
          ? "Private, permission required"
          : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** How old a report is, "14m ago", for the weather's line. */
function ageOf(at: string | null | undefined): string | null {
  const when = at ? new Date(at) : null;
  return when && !Number.isNaN(when.getTime()) ? ago(Date.now() - when.getTime()) : null;
}

/** An airport's name and weather from whatever the map has already
 *  asked for it in: the fields in view, the route's, the Class B ones. */
function knownOf(queryClient: QueryClient, ident: string): { name: string; category: string | null } | null {
  for (const key of ["airportsInView", "airportsReporting", "classB"]) {
    for (const [, pins] of queryClient.getQueriesData<(AirportPin | ClassBAirport)[]>({ queryKey: [key] })) {
      const hit = pins?.find((p) => p.ident === ident);
      if (hit) return { name: hit.name, category: hit.flight_category ?? null };
    }
  }
  return null;
}

type CardTab = "radio" | "weather" | "runways" | "diagrams";
/** The card's pages, in the pilot's order, right under its actions, brought
 *  back at the owner's ask (2026-10-29, "bring back the tabs after the
 *  buttons") after a day as one scroll (A2): the radio first, what is
 *  wanted first on the way in, named Info at the owner's ask ("Rename
 *  Freq. to Info"). Their values are the old ones, which the specs and a
 *  kept tab know them by. */
const CARD_TABS: { value: CardTab; label: string }[] = [
  { value: "radio", label: "Info" },
  { value: "weather", label: "Weather" },
  { value: "runways", label: "Runways" },
  { value: "diagrams", label: "Charts" },
];

/**
 * An airport's card in the panel, as a place's is in Maps, laid out at
 * the owner's pick of its redesign (A2, 2026-10-29): the field's pictures
 * across its top -- its runways, from the air, from the ground -- its ident
 * large over them with its name and town, its star beside its Share; four
 * things to do under them -- fly there, land there on the way, call it,
 * find it in Maps (the owner, 2026-11-11) -- and
 * right under them its four tabs, back at the owner's ask: Info (its
 * details, frequencies, lights and services), Weather (the weather there
 * hour by hour, G1, over the reports as sent), Runways and Charts. Opened
 * by a tap on the airport on the chart (AirportsGl), and held in the
 * address (`?place=KDLH`), so a link lands on it.
 *
 * How far it is is from the pilot's own position when it is known, and
 * from the route's departure otherwise.
 */
export default function PlaceCard({
  ident,
  from,
  onClose,
  onFlyHere,
  onAddStop,
  addStopOff,
  startOn,
  onStarted,
  stop,
  arrival,
}: {
  ident: string;
  /** What the distance is measured from where own ship has no fix: the
   *  route's departure. */
  from: { point: LatLon; name: string | null } | null;
  onClose: () => void;
  onFlyHere: (place: AirportPlace) => void;
  /** Add Stop: the field the route's next stop, before its destination
   *  (or the end a half route lacks, or the first point of a new one);
   *  none where it is in the route already. */
  onAddStop?: (place: AirportPlace) => void;
  /** Why Add Stop is greyed (on the route already, the route full). */
  addStopOff?: string;
  /** Opened on a part of a tab: the route's Approaches opens the
   *  destination's on its approaches. `onStarted` once it has. */
  startOn?: "approaches";
  onStarted?: () => void;
  /** A stop the planner suggests here, opened from its pin on the map or
   *  the route's box: its figures under the actions (StopStrip), and Add
   *  Stop puts it in at its place. */
  stop?: SuggestedStop;
  /** Where the field is the planned flight's destination: when it leaves
   *  (ISO; null for now) and how long until it lands, minutes, for the
   *  hour its forecast marks. */
  arrival?: { depart: string | null; minutes: number };
}) {
  // Asked again every five minutes in sight (lib/shown): its METAR stayed the one it opened with (the audit's finding).
  const asked = { ...airportQuery(ident), refetchInterval: 5 * 60_000, subscribed: useShown() };
  const { data: place, isLoading, error, refetch, isFetching } = useQuery(asked);
  // What the map knows of it already -- its name and its weather's
  // colour, from the chip that was tapped (AirportsGl, ClassBGl) --
  // at once: the card read "Looking the airport up…" until its own
  // answer came, a second or more on a phone while the chart's tiles
  // loaded.
  const known = knownOf(useQueryClient(), ident);
  // And what this browser keeps of it -- Home, a Favorite, one picked
  // lately -- its whole name: a card opened from a Favorite, or from the
  // address on a page just loaded, read its ident alone over an empty
  // card while its answer queued behind the page's first requests.
  const kept = useKeptAirport(ident);
  // How far, from own ship's fix as it is, where there is one: the card's
  // own, drawn again at each, where the page under it is not (its
  // useOwnShipNear) -- tenths of a mile from a fix a hundredth of a degree
  // old would be wrong.
  const ship = useOwnShip((o) => (o.enabled ? o.fix : null));
  const measured = ship ? { point: { lat: ship.lat, lon: ship.lon }, name: null } : from;
  const tabsRef = useRef<HTMLDivElement>(null);
  // Fly Here tapped: the tile says so at once, a frame before the route
  // is drawn (PlanWorkspace's flyHere), which is a moment of a phone's --
  // the tap looked lost under it, at the pilot's ask for no lag. The card
  // goes with the route; it is a new card (keyed by its ident) after.
  const [flying, setFlying] = useState(false);

  // The tab picked, kept for the airport while the page is open (useCardTab), Charts where the card opens on its approaches; each tab its own place in the scroll (useTabScroll).
  const [tab, setPicked] = useCardTab<CardTab>(`place:${ident}`, "radio", startOn ? "diagrams" : null);
  useTabScroll(tabsRef, tab);
  // Opened on its approaches (the route's Approaches): at half as every
  // card opens (the owner, 2026-11-11), Charts open on the approaches once
  // the answer is in; the pilot swipes up for the plates. The card may
  // already be open on another tab (it does not remount), and an inactive
  // tab's groups are not drawn: switch, and look the frame after it has drawn.
  const placeIn = !!place;
  const cardId = useId();
  const started = useEffectEvent(() => onStarted?.());
  useEffect(() => {
    if (startOn !== "approaches" || !placeIn) return;
    setPicked("diagrams");
    const look = requestAnimationFrame(() => {
      tabsRef.current
        ?.closest('[data-testid="place-card"]')
        ?.querySelector('[data-chart-group="Approaches"]')
        // Smooth only where motion is welcome: CSS's Reduce Motion rule
        // (index.css) cannot reach a script's own behavior.
        ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      started();
    });
    return () => cancelAnimationFrame(look);
  }, [startOn, placeIn, setPicked]);
  // The runways, sketched or the FAA's diagram cropped to them, a page of
  // the pictures: a tap shows it full screen -- the FAA's diagram, or for
  // a field the FAA draws none for the sketch (SketchViewer).
  const { sketchedRunways, leftOut } = useMemo(() => {
    const strips = place ? stripsOf(place.runways, place.lat, place.lon) : [];
    return { sketchedRunways: strips.map((r) => r.ends.join("/")), leftOut: place ? runwaysLeftOut(place.runways, strips) : 0 };
  }, [place]);
  const sketched = sketchedRunways.length > 0;
  const [diagramOpen, setDiagramOpen] = useState<"faa" | "sketch" | null>(null);
  // The field from the air, the USGS's, and from the ground where
  // Wikipedia has a free photo (wingtip.airport_photos), the first pages of
  // the pictures, at the owner's ask ("airport photos swipe behind the
  // airport diagram thumbnail", 2026-10-23). Which is open full screen.
  // Asked for with the field itself, not after it: they waited for the
  // card's first answer and went 0.6 s after the tap (the 23 Oct timings).
  const { data: photos } = useQuery(photosQuery(ident));
  // The services asked for with it, for the Info tab's foot (StopServices:
  // the fuel first in its On the field).
  usePrefetchQuery(servicesQuery(ident));
  const [picture, setPicture] = useState<"aerial" | "photo" | null>(null);
  const [noRunwaysPicture, setNoRunwaysPicture] = useState(false);
  // The state as the FAA writes it ("MN"), not ISO's region ("US-MN").
  const where = place ? [place.municipality, place.region?.replace(/^US-/, "")].filter(Boolean).join(", ") : null;
  const name = place?.name ?? known?.name ?? kept?.name ?? null;
  const line = place
    ? subtitleOf(place, measured)
    : error
      ? error instanceof ApiError && error.status === 404
        ? "Not found"
        : "Could not be looked up"
      : "…";
  const metar = place?.metar ?? null;
  const weather = place
    ? { status: place.weather_unavailable ? "unavailable" : metar ? "reported" : "no-report", category: metar?.flight_category ?? null }
    : known && { status: known.category ? "reported" : "no-report", category: known.category };
  // A field with no report of its own: the nearest station's within 30
  // nm (wingtip.weather.nearest_report), at the pilot's ask -- its category
  // the card's badge, "≈", only within the ten statute miles a report is
  // said of (`near`).
  const nearby = place && !metar ? (place.nearby_metar ?? null) : null;
  const nearbyCategory = nearby?.metar.flight_category ?? null;
  const nearCategory = nearby?.near ? nearbyCategory : null;
  // And the weather the National Weather Service's Gridded LAMP models at
  // the field itself for the hour (wingtip.glmp), at the pilot's ask: the
  // badge's before a near station's, the model being of this field.
  const modelled = place && !metar ? (place.modelled_weather ?? null) : null;
  // A flight category only: its own, or with none the modelled one or the
  // nearest station's, marked "≈" -- and none at all where neither is
  // had, the weather's line saying why.
  const approximate = modelled
    ? { category: modelled.flight_category, said: "modelled for this field by the National Weather Service, not a report" }
    : nearCategory
      ? { category: nearCategory, said: `from the report of ${nearby?.ident}, another station, not this field's own` }
      : null;
  const category = weather?.category ?? approximate?.category ?? null;
  const chipColour = category ? chipFillOf(category) : null;
  const chip = category && chipColour && (
    <Badge
      // In whichever ink reads on the colour (inkOn): white on a no-report
      // grey was 2.6:1. The FAA's colours (lib/map/marks/flightCategory).
      className={cn("h-[1.625rem] px-2.5 font-bold", TEXT.detail)}
      style={{ backgroundColor: chipColour, color: inkOn(chipColour) }}
      data-testid="place-category"
    >
      {weather?.category ? (
        category
      ) : (
        <>
          {/* Words for VoiceOver, which may read a bare "≈" as a symbol;
              an aria-label on a role-less span may be ignored. */}
          <span aria-hidden>≈ {category}</span>
          <span className="sr-only">
            About {category}, {approximate?.said}
          </span>
        </>
      )}
    </Badge>
  );
  // The weather in a line at the top of its tab where there is no
  // forecast to say, as a pilot reads a report first: the wind, the
  // visibility and the ceiling (the lowest broken or overcast layer, 14
  // CFR 1.1), and how old it is; with none of its own, the model's or the
  // nearest station's, said as such.
  const weatherLine = metar
    ? [
        windLine(metar),
        metar.visibility_sm != null ? miles(metar.visibility_sm) : null,
        metar.ceiling_ft == null ? "No ceiling" : `Ceiling ${feet(metar.ceiling_ft)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : modelled
      ? `Modelled: ${modelled.visibility_sm >= 10 ? "10+ sm" : miles(modelled.visibility_sm)} · ${modelled.ceiling_ft == null ? "no ceiling" : `ceiling ${feet(modelled.ceiling_ft)}`}`
      : nearby
        ? `Nearest report ${nearby.ident}, ${nearby.distance_nm} nm ${compassPoint(nearby.bearing_deg)}`
        : place?.weather_unavailable
          ? "The weather service could not be reached"
          : "No weather station reports from this field";
  const weatherAge = metar ? ageOf(metar.observed_at) : nearby ? ageOf(nearby.metar.observed_at) : null;
  // And hour by hour, as Apple's Weather has it (the owner's pick, G1):
  // Now from the report, each hour after it from the field's own TAF,
  // and a sentence of what they say, written from them (features/plan/lib/hourly). Read
  // again each minute, as the hours move on.
  const tafText = place?.taf ?? null;
  const now = useMinuteClock();
  const hourly = useMemo(() => {
    const hours = hoursOf({ metar, taf: tafText, now });
    return { hours, sentence: sentenceOf(hours) };
  }, [metar, tafText, now]);
  // The hour the planned flight lands in, where this is its destination.
  const landsAt = arrival ? (arrival.depart ? Date.parse(arrival.depart) : now) + arrival.minutes * 60_000 : null;
  const landsIn = landsAt != null && !Number.isNaN(landsAt) ? arrivalHour(hourly.hours, landsAt) : null;
  const ident4 = place?.ident ?? ident;
  // The pictures, a swipe across (PictureSlides): the field from the air
  // first, then its runways, then the field from the ground, at the
  // owner's ask (2026-10-29: "make the aerial view as the first image and
  // then next one can be the airport diagram"); the runways first where
  // there is no aerial.
  const runwaysSlide = (
    <div className="relative size-full bg-background">
      {/* A tap where there is nothing to draw opens the Runways tab
          where it has rows (runways whose ends are unsurveyed, a pattern
          altitude); otherwise it is words, not a button. */}
      {place && !sketched && (
        <div
          data-testid="place-runway-sketch"
          className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground", TEXT.note)}
        >
          No runways to draw
        </div>
      )}
      {place && sketched && (
        <div
          role="img"
          data-testid="place-runway-sketch"
          aria-label={`${place.ident} runways ${sketchedRunways.join(", ")}, north up${leftOut ? `, ${leftOut} more not drawn, their ends unsurveyed` : ""}. ${place.airport_diagram_url ? "Airport diagram" : "Runways sketch"}`}
          // The whole head, as the photos fill it, the name on the shade over
          // its foot: kept clear of the name, the crop sat in a box with bands
          // either side and under it (the owner's screenshot, 2026-10-29: "Why
          // is airport diagram not filling the rest of the space"). Full
          // screen from the head's button once it is shown alone (PhotoHead).
          className="absolute inset-0"
        >
          {/* The FAA's own diagram, cropped to its runways, where the field
            has one, at the pilot's ask; the card's sketch of them
            where it has none, or the crop cannot be had. */}
          {place.airport_diagram_cycle && !noRunwaysPicture ? (
            <img
              src={diagramRunwaysPicture(place.ident, place.airport_diagram_cycle)}
              alt=""
              onError={() => setNoRunwaysPicture(true)}
              data-testid="place-diagram-runways"
              // The diagram's white paper round it, black at night: the
              // inversion turns the paper too.
              className="absolute inset-0 size-full bg-white object-cover dark:invert"
            />
          ) : (
            <RunwaySketch runways={place.runways} lat={place.lat} lon={place.lon} />
          )}
        </div>
      )}
    </div>
  );
  const slides: (CardSlide | null | undefined)[] = [
    photos && {
      key: "aerial",
      open: () => setPicture("aerial"),
      label: `${ident4} from the air, full screen`,
      testId: "place-aerial-open",
      picture: <PhotoSlide src={photos.aerial_url} alt="" label={`${ident4} from the air`} testId="place-aerial" />,
    },
    {
      key: "diagram",
      picture: runwaysSlide,
      testId: "place-diagram-open",
      open: place && sketched ? () => setDiagramOpen(place.airport_diagram_url ? "faa" : "sketch") : undefined,
      label: place?.airport_diagram_url ? `${ident4} airport diagram, full screen` : `${ident4} runways sketch, full screen`,
    },
    photos?.photo && {
      key: "photo",
      open: () => setPicture("photo"),
      label: `${ident4} from the ground, full screen`,
      testId: "place-photo-open",
      picture: (
        <PhotoSlide
          src={photos.photo.url}
          alt=""
          label={`${ident4} from the ground`}
          testId="place-photo"
          creditTestId="place-photo-credit"
          // Its photographer and licence, as Commons' licences ask.
          credit={`${photos.photo.credit}${photos.photo.license ? ` · ${photos.photo.license}` : ""}`}
        />
      ),
    },
  ];
  // The pill's line and picture, at the owner's pick (P5, 2026-10-29): the
  // category as the chip says it ("≈" where it is not the field's own),
  // the reported wind as FPL's list writes it, and the name; the head's
  // first picture -- the aerial, else the FAA diagram's runways where it
  // is drawn, none for the sketch, drawn in the page.
  const pillWind = metar ? reportedWind(metar.wind_dir_true_deg, metar.wind_speed_kt, metar.wind_gust_kt) : null;
  const pillLine = [
    category && (weather?.category ? category : `≈ ${category}`),
    pillWind && (pillWind === "calm" ? "Calm" : `${pillWind.dir} ${pillWind.speed}`),
    name && name !== ident4 ? name : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pillPicture =
    photos?.aerial_url ??
    (place && sketched && place.airport_diagram_cycle && !noRunwaysPicture
      ? diagramRunwaysPicture(place.ident, place.airport_diagram_cycle)
      : undefined);
  const share = () =>
    void shareOrCopy({ title: place?.name ?? ident, url: `${location.origin}/app/plan?place=${place?.ident ?? ident}` }).catch(() => {});
  return (
    // Half way as it opens, from the map, the search or a list alike (the
    // card rule's 2); its own drawer, sized from here (useCardSize).
    <SheetCard head={false} testId="place-card" cardId={cardId}>
      {place || !error ? (
        <>
          {/* The head and the actions from the first frame, live once the
              answer is in: the card one shape while its answer comes, at
              the pilot's ask. */}
          <CardTitle
            title={ident4}
            testId="place-head"
            titleTestId="place-name"
            subtitleTestId="place-where"
            twoLines
            subtitle={name && name !== ident4 ? <PlaceSubtitle name={name} where={where} place={place ?? null} /> : where || " "}
            line={
              <>
                {line && (
                  <p className={cn("line-clamp-2 text-muted-foreground", TEXT.note)} data-testid="place-line">
                    {line}
                  </p>
                )}
              </>
            }
            onClose={onClose}
            onShare={share}
            closeTestId="place-close"
            shareTestId="place-share"
            beside={<PlaceFavorite ident={kept?.ident ?? ident} place={place ?? null} />}
            pill={{ line: pillLine || undefined, picture: pillPicture }}
          />
          {/* The pictures' lightboxes (Base UI Dialogs), opened from the
              pictures lower in the card (CardPictures). */}
          {diagramOpen === "faa" && place?.airport_diagram_url && (
            <FaaChart
              title={`${place.ident} airport diagram`}
              url={place.airport_diagram_url}
              airport={place.ident}
              onClose={() => setDiagramOpen(null)}
            />
          )}
          {picture && photos && (
            <Suspense fallback={null}>
              <PictureViewer
                title={`${ident4} ${picture === "aerial" ? "from the air" : "from the ground"}`}
                pages={[
                  picture === "aerial" || !photos.photo
                    ? { src: photos.aerial_url, width: 900, height: 600 }
                    : { src: photos.photo.url, width: photos.photo.width ?? 900, height: photos.photo.height ?? 600 },
                ]}
                onClose={() => setPicture(null)}
              />
            </Suspense>
          )}
          {diagramOpen === "sketch" && place && (
            <Suspense fallback={null}>
              <SketchViewer
                ident={place.ident}
                runways={place.runways}
                lat={place.lat}
                lon={place.lon}
                onClose={() => setDiagramOpen(null)}
              />
            </Suspense>
          )}
          <PlaceActions
            place={place ?? null}
            flying={flying}
            onFlyHere={(p) => {
              setFlying(true);
              onFlyHere(p);
            }}
            onAddStop={onAddStop}
            addStopOff={addStopOff}
          />
          {/* The field from the air, its runways and from the ground, a row
              of large tiles under the actions, as Apple Maps' place card
              has its photos (the owner's screenshot, 2026-11-10), a click
              each to its lightbox. */}
          {place && (
            <div className="pt-3">
              <CardPictures
                slides={slides}
                label={`${ident4}: its runways${photos ? ", from the air" : ""}${photos?.photo ? ", from the ground" : ""}`}
                testId="place-pictures"
              />
            </div>
          )}
          {/* Closures and TFRs near it first, as Maps' live cards (PlaceNotams). */}
          <PlaceAlerts ident={ident} onOpen={() => setPicked("radio")} />
          {place && stop && <StopStrip ident={place.ident} stop={stop} />}
        </>
      ) : (
        <div className="flex flex-col pt-[var(--corner-inset,0.75rem)]" data-to-edge="">
          <CardHead
            name={kept?.name ?? known?.name ?? ident}
            nameTestId="place-name"
            // Not found only where the planner said so: a planner out of
            // reach for a moment (restarted) read "not found" for KBUR.
            line={line}
            lineTestId="place-line"
            onClose={onClose}
            closeTestId="place-close"
          />
        </div>
      )}

      {/* The card's four tabs under its actions (the owner, 2026-10-29),
          greyed until the answer comes: a tap would raise the sheet over
          empty pages. Tapped, the panel all the way up, the open one
          tapped again there back half way (CardTabBar). */}
      {!(error && !place) && (
        <Tabs value={tab} onValueChange={(next) => setPicked(next as typeof tab)} className="gap-0">
          <CardTabBar
            tabs={CARD_TABS}
            value={tab}
            onPick={setPicked}
            activateOnFocus
            testIdPrefix="place-tab"
            disabled={!place}
            barRef={tabsRef}
            // Pinned directly under the card's head (PINNED_BELOW, plain CSS), frosted as it is, its sections a tap away.
            className={cn("frost-head sticky z-10 -mx-4 mt-3 scroll-mt-28 px-4 py-1", PINNED_BELOW)}
          />
          <CardTabPanel value="radio" className="space-y-0">
            {place && <PlaceInfoTab place={place} where={where} />}
          </CardTabPanel>
          <CardTabPanel value="weather" className="space-y-0">
            <PlaceWeatherTab
              ident={ident}
              place={place}
              known={known}
              chip={chip}
              hourly={hourly}
              weatherLine={weatherLine}
              weatherAge={weatherAge}
              arrival={landsIn != null && landsAt != null ? { index: landsIn, at: landsAt } : null}
            />
          </CardTabPanel>

          <CardTabPanel value="runways" className="space-y-0">
            {place && <PlaceRunwaysTab place={place} />}
          </CardTabPanel>

          <CardTabPanel value="diagrams" className="space-y-0">
            {place && <PlaceChartsTab place={place} sketched={sketched} startOn={startOn} />}
          </CardTabPanel>
        </Tabs>
      )}
      {isLoading && !known && <p className={cn("pt-4 text-muted-foreground", TEXT.prose)}>Fetching the airport…</p>}
      {/* Where the planner could not be reached, the way to ask again, in
          the card that could not be had (lib/problems: errors where they
          happen); an airport not found has nothing to ask again. */}
      {error && !place && !(error instanceof ApiError && error.status === 404) && (
        <div className="pt-4">
          <ListGroup>
            <ListRow
              title={<span className="text-tint">{isFetching ? "Trying again…" : "Try again"}</span>}
              onClick={isFetching ? undefined : () => void refetch()}
              data-testid="place-retry"
            />
          </ListGroup>
        </div>
      )}
    </SheetCard>
  );
}
