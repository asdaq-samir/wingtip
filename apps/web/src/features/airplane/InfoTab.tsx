import { CardPictures } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import type { AircraftRegistration } from "../../lib/api/types";
import AirplaneInfo from "./AirplaneInfo";
import type { useAirplaneCard } from "./useAirplaneCard";

/**
 * The airplane card's Info tab, for an N-number (AirplaneCard): its facts
 * in a sideways strip (AirplaneFacts) and its photo as the airport card's
 * pictures, then its public record (AirplaneInfo). `faa` is the registry's
 * record as the flight's detail carries it, there before the N-number's
 * own lookup answers on a card opened from traffic.
 */
export default function InfoTab({
  tail,
  card,
  faa,
}: {
  tail: string;
  card: ReturnType<typeof useAirplaneCard>;
  faa: AircraftRegistration | null | undefined;
}) {
  const record = card.record ?? faa ?? null;
  const photo = card.photo;
  const src = photo ? (photo.thumbnail_large ?? photo.thumbnail) : null;
  return (
    <>
      <AirplaneFacts record={card.details?.registration ?? record} model={card.details?.model} testId="airplane-facts" />
      {/* Its photo once Planespotters.net answered with one, on its terms (docs/legal/credits.md):
          the photographer named on it, the picture a plain link to its page, its address used as
          given and never kept by the app. */}
      {photo && src && (
        <div>
          <CardPictures
            label={`${tail}: its photo`}
            slides={[
              {
                key: "photo",
                href: photo.link,
                label: `${tail}'s photo on ${photo.source}`,
                testId: "airplane-photo-open",
                picture: (
                  <PhotoSlide
                    src={src}
                    alt={`The airplane, photographed by ${photo.photographer ?? "a Planespotters.net photographer"}`}
                    label={`${tail}'s photo`}
                    credit={`© ${photo.photographer ?? "Photographer"} · ${photo.source}`}
                    testId="airplane-photo"
                    creditTestId="airplane-photo-credit"
                  />
                ),
              },
            ]}
          />
        </div>
      )}
      <AirplaneInfo record={record} details={card.details} detailsFailed={card.detailsFailed} history={card.history} />
    </>
  );
}
