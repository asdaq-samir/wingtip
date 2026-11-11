import { useEffect, useId, useRef, useState } from "react";
import type { Drawer } from "@base-ui/react/drawer";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Navigation2 } from "lucide-react";
import { cn } from "cn";
import { Badge } from "../../../components/ui/badge";
import { ListPageHead } from "../../../components/Favorites";
import { SheetCard } from "../../../components/SheetCard";
import { closeTopCard } from "../../../lib/openCards";
import { useCardSize } from "../../../lib/sheetCards";
import QueryState from "../../../components/QueryState";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { api } from "../../../lib/api/client";
import type { NearestAirport, PlaceFound } from "../../../lib/api/types";
import { compassPoint, saidPoint } from "../../../lib/compass";
import { nmAway, nmFigure } from "../../../lib/useAway";
import { mhzText } from "../../../lib/frequencies";
import { chipFillOf, colourOf } from "../../../lib/map/marks/flightCategory";
import { glideRangeNm, reachesField, underway } from "../../../lib/map/position/glide";
import { useGlideRatio } from "../../../lib/map/position/useGlideRatio";
import { AskFigure } from "../../../components/airplane/AskFigure";
import { airportMarkSvg } from "../../../lib/map/marks/airportMark";
import { positionNow, useOwnShip, useOwnFixShown } from "../../../lib/map/position/ownShip";
import { nearestQuery } from "../../../lib/queryClient";
import { inkOn } from "../../../lib/scoreScale";
import { TEXT } from "../../../lib/text";
import { useTabSearch } from "../lib/tabSearch";
import { altFt } from "../../../lib/format";
import { FINDING_TONE } from "../../../lib/findings";

export interface NearFrom {
  label: string;
  lat: number;
  lon: number;
}

/** What is typed waits this long for the next letter before it is asked
 *  about: the Census geocoder is a request a word, not a letter. */
const TYPING_MS = 250;

/**
 * Where Nearest is from: the pilot's position until a place is typed --
 * a town, a street address, an airport -- at the pilot's ask, as Maps'
 * search asks where. Typed in Nearest's field, in the panel's head
 * (PlanWorkspace, features/plan/lib/tabSearch), which reads "Current position" until
 * then; what answers comes up here, at the top of the list, and the
 * field's clear goes back to the position.
 */
function NearAnswers({ from, onFrom }: { from: NearFrom | null; onFrom: (from: NearFrom | null) => void }) {
  const typed = useTabSearch((s) => s.near);
  const [asked, setAsked] = useState("");
  // The field shows the place picked, as it did when it was this card's.
  // Not emptied as the card first comes up with no place: the field is in
  // the panel's head, there before the card, and what was typed into it
  // in that moment was wiped (nearest.spec's smoke test, on a fast stack).
  const shownFrom = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const label = from?.label ?? null;
    const first = shownFrom.current === undefined;
    shownFrom.current = label;
    if (first && label === null) return;
    useTabSearch.setState({ near: label ?? "" });
  }, [from?.label]);
  useEffect(() => {
    const later = window.setTimeout(() => setAsked(typed.trim()), TYPING_MS);
    return () => window.clearTimeout(later);
  }, [typed]);
  const searching = asked.length >= 2 && asked !== from?.label && typed.trim() !== from?.label;
  const {
    data: answered,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["places", asked],
    queryFn: () => api.placesSearch(asked),
    enabled: searching,
    staleTime: 60 * 60_000,
    meta: { silent: true },
  });
  // What answers belongs to what was asked, which trails what is typed by
  // TYPING_MS: until they meet, nothing is offered or picked, so Return
  // cannot take the first result of an earlier text.
  const current = typed.trim() === asked;
  const found = current ? answered : undefined;
  const pick = (place: PlaceFound | null) => {
    onFrom(place && { label: place.label, lat: place.lat, lon: place.lon });
    useTabSearch.setState({ near: place?.label ?? "" });
    (document.activeElement as HTMLElement | null)?.blur();
  };
  // Return in the field: the first that answers. The clear: the position.
  const first = found?.[0];
  useEffect(() => {
    useTabSearch.setState({
      submitNear: () => {
        if (first) pick(first);
      },
      clearNear: () => pick(null),
    });
  });
  useEffect(() => () => useTabSearch.setState({ submitNear: null, clearNear: null }), []);
  if (!searching) return null;
  return (
    <div className="pb-4">
      <ListGroup>
        {(found ?? []).map((place) => (
          <ListRow
            key={`${place.kind}-${place.label}`}
            media={<MapPin className="size-5 text-muted-foreground" />}
            title={place.label}
            description={place.kind === "airport" ? "Airport" : place.kind === "town" ? "Town" : "Address"}
            onClick={() => pick(place)}
            data-testid="nearest-from-option"
          />
        ))}
        {found && !found.length && !isFetching && <ListRow muted title="Nothing by that name" />}
        {current && isError && <ListRow title={<span className={cn("text-destructive", TEXT.detail)}>Couldn't search. Try again.</span>} />}
        {!found && !(current && isError) && (
          <ListRow title={<span className={cn("text-muted-foreground", TEXT.detail)}>Fetching {typed.trim()}…</span>} />
        )}
        {from && (
          <ListRow
            media={<LocateFixed className="size-5 text-tint" />}
            title="Current position"
            onClick={() => pick(null)}
            data-testid="nearest-from-position"
          />
        )}
      </ListGroup>
    </div>
  );
}

/**
 * One field of Nearest's, at the pilot's ask for a list that reads as an
 * EFB's: the map's own mark for it (its airspace, its weather's dot), the
 * ident and the name, then its weather, longest runway and the frequency
 * listed for it; at the right how far, with an arrow the way to it -- from
 * the airplane's track when it is moving, north up otherwise -- and the
 * compass point. A row that opens the field's card, so its words are the
 * text's and it ends in a chevron, as iOS's do.
 */
function NearestRow({
  field,
  ahead,
  reach,
  onOpen,
}: {
  field: NearestAirport;
  /** The airplane's track, true, when it is moving; else null. */
  ahead: number | null;
  /** Within a still-air glide, arriving at pattern height (reachesField). */
  reach: boolean;
  onOpen: () => void;
}) {
  const category = field.flight_category;
  const use = field.military === "military" ? "military" : field.private ? "private" : null;
  const parts = [
    field.longest_runway_ft ? `${altFt(field.longest_runway_ft)} ft` : null,
    field.radio ? `${field.radio.kind} ${mhzText(field.radio.mhz)}` : null,
    // Listed whoever owns it, and said: in an emergency the pilot in
    // command lands where the emergency needs (14 CFR 91.3(b)), and a
    // military or a private field may be it.
    field.military === "military" ? "military" : field.military === "joint" ? "joint use" : field.private ? "private" : null,
  ].filter(Boolean);
  const point = compassPoint(field.bearing_deg);
  return (
    <ListRow
      media={
        <span
          className="block size-[26px]"
          dangerouslySetInnerHTML={{ __html: airportMarkSvg(field.airspace_class ?? null, colourOf(category), use, "overflow-visible") }}
        />
      }
      title={
        <span className="line-clamp-2">
          <span className="font-semibold">{field.ident}</span> {field.name}
        </span>
      }
      // One run of words, the weather's chip at its head, wrapping between
      // its parts and never inside one ("TWR 123.675" kept whole).
      description={
        <>
          {category && (
            <Badge
              className={cn("mr-1.5 h-auto rounded-sm px-1.5 align-[0.05em] font-bold tracking-wide", TEXT.note)}
              style={{ backgroundColor: chipFillOf(category), color: inkOn(chipFillOf(category)) }}
            >
              {category}
            </Badge>
          )}
          {parts.map((part, i) => (
            <span key={part}>
              {i > 0 && " · "}
              <span className="whitespace-nowrap">{part}</span>
            </span>
          ))}
          {reach && (
            <>
              {parts.length > 0 && " · "}
              <span className={cn("font-semibold whitespace-nowrap", FINDING_TONE.ok)}>within glide</span>
            </>
          )}
        </>
      }
      chevron
      onClick={onOpen}
      data-testid="nearest-airport"
    >
      <span className="flex items-center gap-2">
        <Navigation2
          aria-hidden="true"
          strokeWidth={0}
          data-testid="nearest-arrow"
          className="size-5 shrink-0 fill-current text-foreground"
          style={{ transform: `rotate(${field.bearing_deg - (ahead ?? 0)}deg)` }}
        />
        {/* A label on a plain span has no role and is not spoken, so the
            spoken form is text in the row: VoiceOver would spell out "nm"
            and the compass letters. The bearing is true (the footer says so). */}
        <span className="flex flex-col items-end" aria-hidden="true">
          <span className={cn("font-semibold text-foreground tabular-nums", TEXT.row)}>{nmAway(field.distance_nm)}</span>
          <span className={cn("text-muted-foreground", TEXT.note)}>{point}</span>
        </span>
        <span className="sr-only">
          {nmFigure(field.distance_nm)} nautical miles, true bearing {saidPoint(point)}
        </span>
      </span>
    </ListRow>
  );
}

/**
 * Nearest, as an EFB's, a card in the panel at the pilot's ask -- half
 * way up with the map fitted to the fields above it (RouteMap's FitTo),
 * where it was a sheet of its own over the panel: the ten fields nearest
 * own ship, how far and which way, the longest runway, and -- in the
 * air, with the GPS's altitude -- which are within a still-air glide
 * (lib/map/position/glide), the ring the map draws round own ship. Or nearest a
 * place typed in its field (NearField), at the pilot's ask: a town, an
 * address, an airport. A tap on one opens its card over this one, and
 * its close comes back here. With no position yet, it offers to show it.
 */
export default function NearestCard({
  onOpen,
  from,
  onFrom,
  onBack,
}: {
  onOpen: (ident: string) => void;
  /** Back to Airport's start: the list put away, as every list in full has
   *  its Back (ListPageHead), where this one had no way out but a tab. */
  onBack: () => void;
  /** The place typed, where it is from one (the page's, in its address). */
  from: NearFrom | null;
  onFrom: (from: NearFrom | null) => void;
}) {
  const enabled = useOwnShip((s) => s.enabled);
  const setEnabled = useOwnShip((s) => s.setEnabled);
  const fix = useOwnFixShown();
  const origin = from ?? fix;
  const nearestAsked = useQuery({ ...nearestQuery(origin?.lat ?? 0, origin?.lon ?? 0), enabled: !!origin });
  const data = nearestAsked.data;
  // Asked for the nearest fields, the position is wanted: own ship turned
  // on quietly where the browser already lets it be read (positionNow),
  // as Fly Here does; else the card offers to show it.
  useEffect(() => {
    void positionNow(0);
  }, []);
  // A glide only from where the airplane is, with its altitude.
  // At the picked airplane's own glide ratio; none, no glide said.
  const ratio = useGlideRatio();
  const glide = !from && fix ? glideRangeNm(fix, data?.[0]?.elevation_ft, ratio) : null;
  // The arrows from the airplane's track, where it is moving and the list
  // is from where it is.
  // Underway (the engine's, its flying speed): the GPS track is steady
  // enough to point the rows' arrows from.
  const ahead = !from && fix?.headingDeg != null && underway(fix) ? fix.headingDeg : null;
  const cardId = useId();
  const card = useCardSize(cardId);
  // What its drawer tells it: a tap on the chart (not its own buttons)
  // lowers it to the pill; Escape closes it, a level back, as every card's
  // does (lib/openCards); the rest refused, it is no modal.
  const lowerOnMap = (details: Drawer.Root.ChangeEventDetails) => {
    details.cancel();
    const at = details.event.target instanceof Element ? details.event.target : null;
    if (details.reason === "outside-press") {
      if (at?.closest(".maplibregl-map") && !at.closest("[data-map-controls], .maplibregl-ctrl")) card?.setSize("peek");
      return;
    }
    if (details.reason === "escape-key" && !details.event.defaultPrevented && closeTopCard()) details.event.preventDefault();
  };
  return (
    // At half as it opens, as every card does; a tap on the chart lowers
    // its own drawer to the pill, the list kept (lowerOnMap).
    <SheetCard head={false} testId="nearest-card" cardId={cardId} dismiss={lowerOnMap}>
      <ListPageHead title="Nearest" backLabel="Back to the search" onBack={onBack} testId="nearest-page" />
      <NearAnswers from={from} onFrom={onFrom} />
      <div className="pt-1">
        {!origin ? (
          <ListGroup>
            {enabled ? (
              <ListRow muted title="Finding your position…" />
            ) : (
              <ListRow title="Show my position" onClick={() => setEnabled(true)} data-testid="nearest-show-position" />
            )}
          </ListGroup>
        ) : (
          <ListGroup
            // What the list is from, where the card's name and line said it.
            // No footnote under it, at the owner's ask: the glide is a
            // still-air one, 1.5 nm for every 1,000 ft over the nearest
            // field (the dashed ring); a row is within it where the
            // airplane reaches that field at pattern height over its own
            // elevation (reachesField), so a field on higher ground inside
            // the ring may not be; each row its longest runway and its
            // listed tower, CTAF or UNICOM frequency.
            title={from ? `Near ${from.label}` : glide != null ? `Within a glide: about ${Math.round(glide)} nm` : "Nearest to you"}
          >
            {(data ?? []).map((a) => (
              <NearestRow
                key={a.ident}
                field={a}
                ahead={ahead}
                reach={!from && reachesField(fix, a, ratio)}
                onOpen={() => onOpen(a.ident)}
              />
            ))}
            {/* Where they could not be found, said with Try again, where the
                list stayed on "Looking…" (QueryState). */}
            {!data && (
              <QueryState
                row
                query={nearestAsked}
                fetching="Fetching the nearest fields…"
                failed="The nearest fields could not be found."
              />
            )}
          </ListGroup>
        )}
        {/* In the air with an airplane of no glide ratio: asked for in
            place, the fields listed nearest first meanwhile (AskFigure). */}
        {!from && ratio == null && underway(fix) && <AskFigure figure="glide" what="The glide" testId="nearest-glide-ask" />}
      </div>
    </SheetCard>
  );
}
