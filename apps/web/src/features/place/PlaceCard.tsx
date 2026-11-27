import { useEffect, useId, useMemo, useState, useEffectEvent } from "react";
import { usePrefetchQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeptAirport } from "../../lib/preferences";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { shareOrCopy } from "../../lib/share";
import { placeLink } from "../../lib/flightLink";
import { SheetCard } from "../../components/SheetCard";
import { CardTitle } from "../../components/CardTitle";
import { SkeletonCardInfo } from "../../components/QueryState";
import { CardTabPages, CardTabPanel } from "../../components/CardTabs";
import { useCardTabs } from "../../lib/cardTab";
import { CardUnhad } from "../../components/CardUnhad";
import PlaceActions from "./PlaceActions";
import { ApiError } from "../../lib/api/client";
import { NO_CONNECTION, noConnection } from "../../lib/problems";
import type { AirportPlace } from "../../lib/api/types";
import { useGeo, type LatLon } from "../../lib/geo";
import { placeWeather } from "./placeWeather";
import { awayOf, distanceOf, kindOf, knownOf } from "./placeCardWords";
import { runwaysLeftOut, stripsOf } from "./runwayDrawing";
import { prefersReducedMotion } from "../../lib/motion";
import { airportQuery, photosQuery, servicesQuery } from "../../lib/queryClient";
import { StopStrip, type SuggestedStop } from "./StopServices";
import { PlaceChartsTab } from "./PlaceChartsTab";
import { PlaceInfoPage } from "./PlaceInfoPage";
import { PlaceRunwaysTab } from "./PlaceRunwaysTab";
import { PlaceWeatherTab } from "./PlaceWeatherTab";
import { PlaceSubtitle } from "./PlaceSubtitle";
import { PlaceTabBar, type PlaceTab } from "./PlaceTabBar";
import { useFlyHereMinutes } from "./flyHereTime";
import { useShown, useShownStore } from "../../lib/shown";
import StatusBadge from "../../components/StatusBadge";

/**
 * An airport's card in the panel, as a place's is in Maps, laid out at
 * the owner's pick of its redesign (A2, 2026-10-29): its ident with its
 * name and town, Share and ✕; four things to do under them -- fly there,
 * land there on the way, call it, keep it a Favorite (the owner,
 * 2026-11-11), Fly Here saying the time there; laid out after Apple Maps'
 * place card at the owner's pick of C1 (2026-11-14, canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"): under the
 * actions the page of the tab picked in the floating bar at the card's foot
 * (PlaceTabBar, which takes the place of T4's tabs under the actions): Info
 * (a row of facts, PlaceFacts, its pictures, then its details, frequencies,
 * lights and services, 2026-11-14), Weather (the weather there
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
  asStop,
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
  /** Opened while the pilot adds a stop: Add Stop first, in Fly Here's
   *  place, and Address last (PlaceActions). */
  asStop?: boolean;
}) {
  // Asked again every five minutes in sight (lib/shown): its METAR stayed the one it opened with.
  const asked = { ...airportQuery(ident), refetchInterval: 5 * 60_000, subscribed: useShown() };
  const answer = useQuery(asked);
  const { data: place, error, refetch, isFetching } = answer;
  // With no connection and nothing kept of it, its ask waits paused
  // (lib/queryRetry): said so, not "Fetching the airport…" for good.
  const offline = !place && noConnection(answer);
  // Not had: the planner said no, or the connection is gone and nothing is
  // kept (TanStack asks a lost connection again for as long as the card
  // is open, so that query is never in error): the head says why in its
  // line, where the card's tabs would be.
  const unhad = !place && (!!error || offline);
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
  // Followed while in sight (lib/shown): a card kept under another did the
  // sums at every fix. A string, so it is the same snapshot until it changes.
  const distance = awayOf(
    useShownStore(useOwnShip, (o) => (place ? distanceOf(geo, place, o.enabled && o.fix ? { point: o.fix, name: null } : from) : null)),
  );
  const flyTime = useFlyHereMinutes(place ?? null, from);
  // Fly Here tapped: the tile says so at once, a frame before the route
  // is drawn (PlanWorkspace's flyHere), which is a moment of a phone's --
  // the tap looked lost under it, at the pilot's ask for no lag. The card
  // goes with the route; it is a new card (keyed by its ident) after.
  const [flying, setFlying] = useState(false);

  // The tab picked, kept for the airport while the page is open (useCardTab), Charts where the card opens on its approaches; each tab opening at its own top (useTabScroll).
  const {
    tab,
    pick: setPicked,
    top: setTabBar,
    topNode: tabBar,
  } = useCardTabs<PlaceTab>(`place:${ident}`, "radio", startOn ? "diagrams" : null);
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
  // The field from the air, the USGS's, and from the ground where
  // Wikipedia has a free photo (wingtip.airport_photos), the first pages of
  // the pictures, at the owner's ask ("airport photos swipe behind the
  // airport diagram thumbnail", 2026-10-23). Which is open full screen.
  // Asked for with the field itself, not after it: they waited for the
  // card's first answer and went 0.6 s after the tap (the 23 Oct timings).
  const { data: photos, isPending: photosPending } = useQuery(photosQuery(ident));
  // The services asked for with it, for the Info tab's foot (StopServices:
  // the fuel first in its On the field).
  usePrefetchQuery(servicesQuery(ident));
  const [noRunwaysPicture, setNoRunwaysPicture] = useState(false);
  // The state as the FAA writes it ("MN"), not ISO's region ("US-MN").
  const where = place ? [place.municipality, place.region?.replace(/^US-/, "")].filter(Boolean).join(", ") : null;
  const name = place?.name ?? known?.name ?? kept?.name ?? null;
  const kind = kindOf(place);
  const line = place
    ? null
    : offline
      ? NO_CONNECTION
      : error
        ? error instanceof ApiError && error.status === 404
          ? "Not found"
          : "Could not be looked up"
        : "…";
  const { metar, weather, approximate, category, weatherLine, observedAt } = placeWeather(place, known);
  // The shared StatusBadge in the category's chip colour (AIM 7-1-7's categories, the FAA's colours).
  const chip = category && (
    <StatusBadge category={category} className="h-[1.625rem] px-2.5" data-testid="place-category">
      {weather?.category ? undefined : (
        <>
          {/* Words for VoiceOver, which may read a bare "≈" as a symbol;
              an aria-label on a role-less span may be ignored. */}
          <span aria-hidden>≈ {category}</span>
          <span className="sr-only">
            About {category}, {approximate?.said}
          </span>
        </>
      )}
    </StatusBadge>
  );
  const ident4 = place?.ident ?? ident;
  // The Charts tab's count: the d-TPP's charts it lists, the diagram once.
  const charts = (place?.procedures ?? []).filter((c) => c.kind !== "APD").length + (place?.airport_diagram_url ? 1 : 0);
  const share = () => void shareOrCopy(placeLink({ ident: place?.ident ?? ident, name: place?.name })).catch(() => {});
  return (
    // Half way as it opens, from the map, the search or a list alike (the
    // card rule's 2); its own drawer, sized from here (useCardSize).
    <SheetCard head={false} testId="place-card" cardId={cardId}>
      {!unhad ? (
        <>
          {/* The head and the actions from the first frame, live once the
              answer is in: the card one shape while its answer comes, at
              the pilot's ask. */}
          <CardTitle
            title={ident4}
            testId="place-head"
            titleTestId="place-name"
            // Its full name the head row's second line, centred under the
            // ident and fitted to it, in sight at the card's smallest size
            // too (the owner, 2026-11-11, after Apple Maps' "Buttermilk Cafe /
            // Breakfast and Brunch Restaurant"), a NOTAM's badge after it
            // where one closes the field or a TFR is near, and under it its
            // use line or closed label (kindOf, PlaceSubtitle).
            sub={
              <PlaceSubtitle
                ident={ident}
                place={place}
                name={name && name !== ident4 ? name : null}
                kind={kind}
                tower={place ? (place.towered ? "Towered" : "Non-towered") : null}
              />
            }
            onClose={onClose}
            onShare={share}
            closeTestId="place-close"
            shareTestId="place-share"
          />
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
            time={flyTime}
            asStop={asStop}
          />
          {place && stop && <StopStrip ident={place.ident} stop={stop} />}
        </>
      ) : (
        <CardUnhad
          name={kept?.name ?? known?.name ?? ident}
          nameTestId="place-name"
          // Not found only where the planner said so: a planner out of
          // reach for a moment (restarted) read "not found" for KBUR.
          line={line ?? ""}
          lineTestId="place-line"
          onClose={onClose}
          closeTestId="place-close"
          // The way to ask again where the planner could not be reached; an
          // airport not found has nothing to ask again.
          retry={
            error && !(error instanceof ApiError && error.status === 404)
              ? { fetching: isFetching, onRetry: () => void refetch(), testId: "place-retry" }
              : null
          }
        />
      )}

      {/* The tab's page, then the tabs in a bar floating at the card's foot (C1, the owner, 2026-11-14), greyed
          until the answer comes: a tap would raise the sheet over empty pages. */}
      {!unhad && (
        <CardTabPages
          tab={tab}
          onPick={setPicked}
          top={setTabBar}
          bar={<PlaceTabBar onPick={setPicked} disabled={!place} category={metar?.flight_category ?? null} charts={charts} />}
        >
          {/* Info's page alone starts with the facts and pictures (the owner, 2026-11-14: "Switching tabs should not show those"). */}
          <CardTabPanel value="radio" className="space-y-0 pt-0">
            {place ? (
              <PlaceInfoPage
                place={place}
                where={where}
                facts={{ category, approximate: weather?.category ? null : (approximate?.said ?? null), away: distance }}
                pictures={{
                  photos,
                  photosPending,
                  sketchedRunways,
                  leftOut,
                  noRunwaysPicture,
                  onNoRunwaysPicture: () => setNoRunwaysPicture(true),
                }}
              />
            ) : (
              // Its shape while it comes: the five facts and the first picture (PlaceFacts, PlacePictures).
              <SkeletonCardInfo facts={5} fetching="Fetching the airport…" />
            )}
          </CardTabPanel>
          <CardTabPanel value="weather" className="space-y-0">
            <PlaceWeatherTab
              ident={ident}
              place={place}
              known={known}
              chip={chip}
              forecast={{ metar, taf: place?.taf ?? null, arrival }}
              weatherLine={weatherLine}
              observedAt={observedAt}
            />
          </CardTabPanel>

          <CardTabPanel value="runways" className="space-y-0">
            {place && <PlaceRunwaysTab place={place} />}
          </CardTabPanel>

          <CardTabPanel value="diagrams" className="space-y-0">
            {place && <PlaceChartsTab place={place} sketched={sketched} startOn={startOn} />}
          </CardTabPanel>
        </CardTabPages>
      )}
    </SheetCard>
  );
}
