import { cn } from "cn";
import type { AirplanePhoto } from "../../lib/api/types";
import { TEXT } from "../../lib/text";

/**
 * The airplane's photo at the card's head, only once Planespotters.net has
 * answered with one, on its terms (docs/legal/credits.md): the
 * photographer's name in sight beside it, the picture a plain link to its
 * page, its address used as given and never kept by the app. A thumbnail
 * beside the credit, so the card's tabs stay in sight at its half size.
 */
export default function AirplanePhotoHead({ photo }: { photo: AirplanePhoto }) {
  const src = photo.thumbnail_large ?? photo.thumbnail;
  if (!src) return null;
  return (
    <figure className="flex items-center gap-3" data-testid="airplane-photo">
      <a href={photo.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
        <img
          src={src}
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          alt={`The airplane, photographed by ${photo.photographer ?? "a Planespotters.net photographer"}`}
          className="h-16 w-24 rounded-lg object-cover"
          loading="lazy"
        />
      </a>
      <figcaption className={cn("text-muted-foreground", TEXT.note)}>
        <a href={photo.link} target="_blank" rel="noopener noreferrer" className="text-tint" data-testid="airplane-photo-credit">
          {`© ${photo.photographer ?? "Photographer"} · ${photo.source}`}
        </a>
      </figcaption>
    </figure>
  );
}
