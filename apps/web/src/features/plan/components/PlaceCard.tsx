import { lazy, Suspense, useEffect, useId, useMemo, useState, useEffectEvent } from "react";
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
import { CardTabPanel } from "../../../components/CardTabs";
import { Tabs } from "../../../components/ui/tabs";
import { useCardTab } from "../lib/cardTab";
import { useTabScroll } from "../lib/tabScroll";
import PlaceActions from "./place/PlaceActions";
import { ApiError } from "../../../lib/api/client";
import type { AirportPin, AirportPlace, ClassBAirport } from "../../../lib/api/types";
import { compassPoint } from "../../../lib/compass";
import { useGeo, type Geo, type LatLon } from "../../../lib/geo";
import { awayFrom } from "../../../lib/useAway";
import { chipFillOf } from "../../../lib/map/marks/flightCategory";
import { inkOn } from "../../../lib/scoreScale";
import { clockTime, feet, miles, nm, zoneName } from "../../../lib/format";
import { reportedWind } from "../format";
import { placeWind } from "./place/placeWind";
import { FaaChart } from "./AirportDiagram";
import { RunwaySketch } from "./RunwaySketch";
import { runwaysLeftOut, stripsOf } from "../lib/runwaySketch";
import { TEXT } from "../../../lib/text";
import { diagramRunwaysPicture } from "../../../lib/diagram";
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
import { PlaceSubtitle } from "./place/PlaceSubtitle";
import { PlaceTabBar, PlaceWeatherLine, type PlaceTab } from "./place/PlaceTabBar";
import { useShown } from "../../../lib/shown";
import { Badge } from "../../../components/ui/badge";
import { callEngine } from "../../../lib/engine/engine";

const SketchViewer = lazy(() => import("./SketchViewer"));
const PictureViewer = lazy(() => import("./AirportDiagramViewer")); // the pictures behind the diagram, full screen to pinch in on

/** "18 nm NE", from wherever the card is measured from. */
function away(geo: Geo, from: LatLon, to: LatLon): string {
  return geo.distanceNm(from, to) < 0.5 ? "here" : awayFrom(geo, from, to);
}

/** How far the field is, for the Info tab's Details (the owner,
 *  2026-11-11: "Add distance to details") -- "18 nm NE of C81". Nothing
 *  where there is nothing to measure from, nor where the start is the
 *  field itself: the departure's own card, with no fix, said "here of
 *  KMSN", as the phones said "From KMSN 0 nm". */
function distanceOf(geo: Geo | null, place: AirportPlace, from: { point: LatLon; name: string | null } | null): string | null {
  const itself = !!from?.name && (sameField(from.name, place.ident) || (geo?.distanceNm(from.point, place) ?? Infinity) < 0.5);
  if (!geo || !from || itself) return null;
  return from.name ? `${away(geo, from.point, place)} of ${from.name}` : away(geo, from.point, place);
}

/** Who may land there, the card's one use line on every app (the owner,
 *  2026-11-13), under its name (PlaceSubtitle): the engine's airport_use_words,
 *  "Private: permission required", "Military: prior permission required",
 *  none for a public or joint-use field; first, one NASR lists as closed,
 *  its label (decision 0043). */
function kindOf(place: AirportPlace | undefined): string | null {
  if (!place || place.closed) return place?.closed ?? null;
  return callEngine("airport_use_words", { private: place.private, military: place.military ?? null }).words;
}

/** A forecast's hour in the sentence over the hours, this device's clock
 *  with its zone, "15:00 CST": the card says "Observed 0355Z" beside it,
 *  and a bare "15:00" read as either (the web audit's WEB-9). */
const zonedClock = (ms: number) => `${clockTime(new Date(ms))} ${zoneName(new Date(ms))}`;

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

/**
 * An airport's card in the panel, as a place's is in Maps, laid out at
 * the owner's pick of its redesign (A2, 2026-10-29): its ident with its
 * name and town, Share and ✕; four things to do under them -- fly there,
 * land there on the way, call it, keep it a Favorite (the owner,
 * 2026-11-11) -- and directly under them its four tabs (the owner's T4,
 * 2026-11-14), the field's report in a line under them: Info (its
 * pictures first, then its details, frequencies, lights and services), Weather (the weather there hour by hour, G1, over the
 * reports as sent), Runways and Charts. Opened
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
  // How far, from own ship's fix as it is (not useOwnShipNear's, a hundredth
  // of a degree old), as words, so the card redraws only when they change.
  const geo = useGeo();
  const distance = useOwnShip((o) => (place ? distanceOf(geo, place, o.enabled && o.fix ? { point: o.fix, name: null } : from) : null));
  // Fly Here tapped: the tile says so at once, a frame before the route
  // is drawn (PlanWorkspace's flyHere), which is a moment of a phone's --
  // the tap looked lost under it, at the pilot's ask for no lag. The card
  // goes with the route; it is a new card (keyed by its ident) after.
  const [flying, setFlying] = useState(false);

  // The tab picked, kept for the airport while the page is open (useCardTab), Charts where the card opens on its approaches; each tab its own place in the scroll (useTabScroll).
  const [tab, setPicked] = useCardTab<PlaceTab>(`place:${ident}`, "radio", startOn ? "diagrams" : null);
  const [tabBar, setTabBar] = useTabScroll(tab);
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
      tabBar
        ?.closest('[data-testid="place-card"]')
        ?.querySelector('[data-chart-group="Approaches"]')
        // Smooth only where motion is welcome: CSS's Reduce Motion rule
        // (index.css) cannot reach a script's own behavior.
        ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      started();
    });
    return () => cancelAnimationFrame(look);
  }, [startOn, placeIn, setPicked, tabBar]);
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
  const kind = kindOf(place);
  const line = place ? null : error ? (error instanceof ApiError && error.status === 404 ? "Not found" : "Could not be looked up") : "…";
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
        placeWind(metar),
        metar.visibility_sm != null ? miles(metar.visibility_sm, metar.visibility_plus) : null,
        metar.ceiling_ft == null ? "No ceiling" : `Ceiling ${feet(metar.ceiling_ft)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : modelled
      ? `Modelled: ${modelled.visibility_sm >= 10 ? "10+ sm" : miles(modelled.visibility_sm)} · ${modelled.ceiling_ft == null ? "no ceiling" : `ceiling ${feet(modelled.ceiling_ft)}`}`
      : nearby
        ? `Nearest report ${nearby.ident}, ${nm(nearby.distance_nm)} ${compassPoint(nearby.bearing_deg)}`
        : place?.weather_unavailable
          ? "The weather service could not be reached"
          : "No weather station reports from this field";
  const observedAt = (metar ? metar.observed_at : nearby?.metar.observed_at) ?? null;
  // And hour by hour, as Apple's Weather has it (the owner's pick, G1):
  // Now from the report, each hour after it from the field's own TAF,
  // and a sentence of what they say, written from them (features/plan/lib/hourly). Read
  // again each minute, as the hours move on.
  const tafText = place?.taf ?? null;
  const now = useMinuteClock();
  const hourly = useMemo(() => {
    const hours = hoursOf({ metar, taf: tafText, now });
    return { hours, sentence: sentenceOf(hours, zonedClock) };
  }, [metar, tafText, now]);
  // The hour the planned flight lands in, where this is its destination.
  const landsAt = arrival ? (arrival.depart ? Date.parse(arrival.depart) : now) + arrival.minutes * 60_000 : null;
  const landsIn = landsAt != null && !Number.isNaN(landsAt) ? arrivalHour(hourly.hours, landsAt) : null;
  const ident4 = place?.ident ?? ident;
  // The Charts tab's count: the d-TPP's charts it lists, the diagram once.
  const charts = (place?.procedures ?? []).filter((c) => c.kind !== "APD").length + (place?.airport_diagram_url ? 1 : 0);
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
            where it has none, or the crop cannot be had -- not asked for
            where the planner already knows it cannot (WEB-41). */}
          {place.airport_diagram_cycle && place.airport_diagram_runways !== false && !noRunwaysPicture ? (
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
    (place && sketched && place.airport_diagram_cycle && place.airport_diagram_runways !== false && !noRunwaysPicture
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
            // Its full name the head row's second line, centred under the
            // ident and fitted to it, in sight at the card's smallest size
            // too (the owner, 2026-11-11, after Apple Maps' "Buttermilk Cafe /
            // Breakfast and Brunch Restaurant"), a NOTAM's badge after it
            // where one closes the field or a TFR is near, and under it its
            // use line or closed label (kindOf, PlaceSubtitle).
            sub={<PlaceSubtitle ident={ident} place={place} name={name && name !== ident4 ? name : null} kind={kind} />}
            onClose={onClose}
            onShare={share}
            closeTestId="place-close"
            shareTestId="place-share"
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
            ident={kept?.ident ?? ident}
            flying={flying}
            onFlyHere={(p) => {
              setFlying(true);
              onFlyHere(p);
            }}
            onAddStop={onAddStop}
            addStopOff={addStopOff}
          />
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

      {/* The card's four tabs directly under its actions (the owner,
          2026-10-29, and T4, 2026-11-14: they sat under the pictures, at the
          half card's foot), greyed until the answer comes: a tap would raise
          the sheet over empty pages. */}
      {!(error && !place) && (
        <Tabs value={tab} onValueChange={(next) => setPicked(next as typeof tab)} className="gap-0">
          {/* Pinned directly under the card's head (PINNED_BELOW, plain CSS), frosted as it is, edge to edge, the
              control at the card's margins: on the control itself the -mx-4 kept its 100% width, so it began at
              the sheet's edge and stopped 32 short of the other, the content showing through (the owner's KORD). */}
          <div ref={setTabBar} className={cn("frost-head sticky z-10 -mx-4 mt-3 scroll-mt-28 px-4 py-1", PINNED_BELOW)}>
            <PlaceTabBar onPick={setPicked} disabled={!place} category={metar?.flight_category ?? null} charts={charts} />
          </div>
          <PlaceWeatherLine metar={metar} />
          <CardTabPanel value="radio" className="space-y-0">
            {/* The field from the air, its runways and from the ground, a
                row of large tiles first on Info, as Apple Maps' place card
                has its photos (the owner's screenshot, 2026-11-10), a click
                each to its lightbox. */}
            {place && (
              <div className="pb-5">
                <CardPictures
                  slides={slides}
                  label={`${ident4}: its runways${photos ? ", from the air" : ""}${photos?.photo ? ", from the ground" : ""}`}
                  testId="place-pictures"
                />
              </div>
            )}
            {place && <PlaceInfoTab place={place} where={where} distance={distance} />}
          </CardTabPanel>
          <CardTabPanel value="weather" className="space-y-0">
            <PlaceWeatherTab
              ident={ident}
              place={place}
              known={known}
              chip={chip}
              hourly={hourly}
              weatherLine={weatherLine}
              observedAt={observedAt}
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
