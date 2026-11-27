import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGeo } from "../../lib/geo";
import { useOwnFixShown } from "../../lib/map/position/ownShip";
import { CardPictures, type CardSlide } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import { FlightNow, LiveSketch } from "./FlightSummary";
import { planePhotoQuery } from "./planePhoto";
import FlightNowRows from "./FlightNowRows";
import type { FlightLive } from "./useFlightLive";

// The flight's box filling its slide, the tile's own corners, its lines a
// little closer so the five of them fit the strip's height.
const SLIDE_BOX = "mt-0 h-full gap-1.5 rounded-(--radius-card) ring-inset";

/**
 * The airplane card's first slide while it flies (the owner's design of
 * 2026-11-26, "Main"): its state, its ends with a bar as far along as it
 * has flown, its height, speed and track, when it arrives and how far and
 * how high it is from own ship (FlightNow), carried on each second by
 * FlightNow's own clock, so the rest of the card is not drawn again.
 */
function FlightLiveBox({ live, onOpenAirport }: { live: FlightLive; onOpenAirport?: (ident: string) => void }) {
  const fix = useOwnFixShown();
  return (
    <FlightNow
      className={SLIDE_BOX}
      pending={live.pending}
      latest={live.latest}
      fields={{ from: live.fromField, to: live.toField, landed: false }}
      plane={live.plane}
      badge={live.badge}
      chip={null}
      from={live.fromEnd}
      to={live.toEnd}
      startedAt={live.startedAt}
      departedAt={live.departedAt}
      fix={fix}
      onOpenAirport={onOpenAirport}
      airport={live.airport}
    />
  );
}

/**
 * The airplane card's top, one sideways row of slides as the airport
 * card's pictures (CardPictures; the owner's word, 2026-11-26): first its
 * flight now (FlightLiveBox), or on the ground its one status line
 * (`ground`, the card's words); then its photos -- the N-number's from the
 * card (`photo`), or for traffic the FAA's registry does not hold, its
 * own by its address (`trafficPhoto`) -- then where it has flown,
 * sketched, where there is a way flown to draw.
 */
export function FlightPictures({
  live,
  title,
  ground,
  photo,
  trafficPhoto,
  onOpenAirport,
}: {
  live: FlightLive;
  title: string;
  ground: ReactNode;
  photo: CardSlide | null;
  /** Traffic with no N-number: its photo by its ICAO address (Planespotters). */
  trafficPhoto: string | null;
  onOpenAirport?: (ident: string) => void;
}) {
  const geo = useGeo();
  const { data: picture } = useQuery({ ...planePhotoQuery(trafficPhoto ?? ""), enabled: !!trafficPhoto });
  const { name, plane, trail } = live;
  const slides: (CardSlide | null)[] = [
    // One key for the air and the ground, so the flight stays the row's first as it lands or is heard.
    {
      key: "flight",
      content: true,
      label: plane ? `${title}'s flight now` : `Where ${title} is`,
      picture: plane ? (
        <FlightLiveBox live={live} onOpenAirport={onOpenAirport} />
      ) : (
        <div className="flex size-full items-center rounded-(--radius-card) bg-card px-3.5 py-3 ring-1 ring-border/60 ring-inset">
          {ground}
        </div>
      ),
    },
    photo,
    trafficPhoto && picture
      ? {
          key: "traffic-photo",
          href: picture.link,
          label: `${name}'s photo on Planespotters`,
          testId: "flight-photo-open",
          picture: (
            <PhotoSlide
              src={picture.src}
              alt={name}
              label={`${name}'s photo`}
              // Planespotters' terms: the photographer named beside it.
              credit={`© ${picture.photographer} · Planespotters`}
              testId="flight-photo"
              creditTestId="flight-photo-credit"
            />
          ),
        }
      : null,
    // Where it has flown, sketched only where there is a way flown to draw,
    // two reports at the least: a bare line on white an hour after it
    // landed, or two fields' dots with nothing between, filled a card-wide
    // box (the owner's screenshots, 2026-11-26).
    trail.length > 1
      ? {
          key: "trail",
          label: `Where ${name} has flown`,
          picture: (
            <LiveSketch
              latest={live.latest}
              points={trail}
              // Its track now, or, not heard, its last flight's last way.
              trackDeg={plane?.track_deg ?? (geo ? geo.bearingDeg(trail.at(-2)!, trail.at(-1)!) : null)}
              from={live.fromField}
              to={live.toField}
              empty={live.sketchNote}
            />
          ),
        }
      : null,
  ];
  return <CardPictures slides={slides} label={`${title}: its flight and pictures`} testId="airplane-pictures" />;
}

/** The Flights tab's "Now" group (FlightNowRows), from the flight's live data. */
export function FlightNowDetails({ hex, live, registry }: { hex: string; live: FlightLive; registry: boolean }) {
  return (
    <FlightNowRows
      hex={hex}
      plane={live.plane}
      detail={live.detail}
      detailLoading={live.detailLoading}
      registered={live.registered}
      route={live.route}
      registry={registry}
    />
  );
}
