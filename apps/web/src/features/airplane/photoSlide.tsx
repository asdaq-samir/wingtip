import type { CardSlide } from "../../components/CardPictures";
import { PhotoSlide } from "../../components/PictureSlides";
import type { useAirplaneCard } from "./useAirplaneCard";

type Photo = ReturnType<typeof useAirplaneCard>["photo"];

/**
 * An N-number's photo as a slide of the card's top row (FlightPictures),
 * once Planespotters.net answered with one, on its terms
 * (docs/legal/credits.md): the photographer named on it, the picture a
 * plain link to its page, its address used as given and never kept by the
 * app. None where it has no photo.
 */
export function airplanePhotoSlide(tail: string | null, photo: Photo): CardSlide | null {
  const src = photo ? (photo.thumbnail_large ?? photo.thumbnail) : null;
  if (!tail || !photo || !src) return null;
  return {
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
  };
}
