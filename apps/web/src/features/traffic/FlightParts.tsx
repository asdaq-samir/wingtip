import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGeo } from "../../lib/geo";
import { useOwnFixShown } from "../../lib/map/position/ownShip";
import { CardPictures, type CardSlide } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import { FlightNow, LiveSketch } from "./FlightSummary";
import { planePhotoQuery } from "./planePhoto";
import type { FlightLive } from "./useFlightLive";

// The flight's box at the head of the Flights tab, the cards' own corners.
const SLIDE_BOX = "mt-0 gap-1.5 rounded-(--radius-card) ring-inset";

/**
 * The airplane card's flight while it flies (the owner's design of
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
 * The airplane card's flight now, at the head of its Flights tab (the
 * owner, 2026-11-27: "flights can show the in the air card"): in the air
 * its live box (FlightLiveBox), on the ground its one status line
 * (`ground`, the card's words).
 */
export function FlightNowBox({
  live,
  title,
  ground,
  onOpenAirport,
}: {
  live: FlightLive;
  title: string;
  ground: ReactNode;
  onOpenAirport?: (ident: string) => void;
}) {
  return (
    <section aria-label={live.plane ? `${title}'s flight now` : `Where ${title} is`} data-testid="airplane-flight-now">
      {live.plane ? (
        <FlightLiveBox live={live} onOpenAirport={onOpenAirport} />
      ) : (
        <div className="flex items-center rounded-(--radius-card) bg-card px-3.5 py-3 ring-1 ring-border/60 ring-inset">{ground}</div>
      )}
    </section>
  );
}

/**
 * The airplane card's pictures, one sideways row as the airport card's
 * (CardPictures), on its Info tab (the owner, 2026-11-27: "info can show
 * the pictures"): its photos -- the N-number's from the card (`photo`),
 * or for traffic the FAA's registry does not hold, its own by its address
 * (`trafficPhoto`) -- then where it has flown, sketched, where there is a
 * way flown to draw. Nothing where it has none.
 */
export function FlightPictures({
  live,
  title,
  photo,
  trafficPhoto,
}: {
  live: FlightLive;
  title: string;
  photo: CardSlide | null;
  /** Traffic with no N-number: its photo by its ICAO address (Planespotters). */
  trafficPhoto: string | null;
}) {
  const geo = useGeo();
  const { data: picture } = useQuery({ ...planePhotoQuery(trafficPhoto ?? ""), enabled: !!trafficPhoto });
  const { name, plane, trail } = live;
  const slides: (CardSlide | null)[] = [
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
  return <CardPictures slides={slides} label={`${title}: its pictures`} testId="airplane-pictures" />;
}
