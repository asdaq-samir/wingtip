import { useQuery } from "@tanstack/react-query";
import { useGeo } from "../../lib/geo";
import { useOwnFixShown } from "../../lib/map/position/ownShip";
import { CardPictures, type CardSlide } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import { FlightNow, LiveSketch } from "./FlightSummary";
import { planePhotoQuery } from "./planePhoto";
import FlightInfoTab from "./FlightInfoTab";
import type { FlightLive } from "./useFlightLive";

/**
 * The airplane card's box under its actions while it flies (the owner's
 * design of 2026-11-26, "Main"): its state, its ends with a bar as far
 * along as it has flown, its height, speed and track, and how far and how
 * high it is from own ship (FlightNow), carried on each second.
 */
export function FlightLiveBox({ live, onOpenAirport }: { live: FlightLive; onOpenAirport?: (ident: string) => void }) {
  const fix = useOwnFixShown();
  return (
    <FlightNow
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
 * The airplane card's Flight tab, this flight (the owner's design of
 * 2026-11-26): where it has flown, sketched -- after its photo where the
 * card has no Info tab to hold one, traffic the FAA's registry does not
 * hold -- then its details, its flight number's route and the tower's
 * departure event (FlightInfoTab).
 */
export function FlightTab({ hex, live, photo }: { hex: string; live: FlightLive; photo: boolean }) {
  const geo = useGeo();
  const { data: picture } = useQuery({ ...planePhotoQuery(hex), enabled: photo });
  const { name, plane, trail } = live;
  const slides: (CardSlide | null)[] = [
    photo && picture
      ? {
          key: "photo",
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
    {
      key: "trail",
      label: `Where ${name} has flown`,
      picture: (
        <LiveSketch
          latest={live.latest}
          points={trail}
          // Its track now, or, not heard, its last flight's last way.
          trackDeg={plane?.track_deg ?? (geo && trail.length > 1 ? geo.bearingDeg(trail.at(-2)!, trail.at(-1)!) : null)}
          from={live.fromField}
          to={live.toField}
          empty={live.sketchNote}
        />
      ),
    },
  ];
  return (
    <>
      <CardPictures slides={slides} label={`${name}: ${photo && picture ? "its photo, and " : ""}where it has flown`} />
      <FlightInfoTab
        hex={hex}
        plane={plane}
        detail={live.detail}
        detailLoading={live.detailLoading}
        registered={live.registered}
        route={live.route}
      />
    </>
  );
}
