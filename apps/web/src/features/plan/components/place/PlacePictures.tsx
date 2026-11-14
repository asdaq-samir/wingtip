import { lazy, Suspense, useMemo, useState } from "react";
import { cn } from "cn";
import { CardPictures, type CardSlide } from "../../../../components/CardPictures";
import { PhotoSlide } from "../../../../components/PictureSlides";
import type { AirportPhotos, AirportPlace } from "../../../../lib/api/types";
import { TEXT } from "../../../../lib/text";
import { FaaChart } from "../AirportDiagram";
import { RunwaySketch } from "../RunwaySketch";
import { runwaysPictureOf } from "./runwayPicks";

const SketchViewer = lazy(() => import("../SketchViewer"));
const PictureViewer = lazy(() => import("../AirportDiagramViewer")); // the pictures behind the diagram, full screen to pinch in on

/**
 * The airport card's pictures, a sideways row of large rounded tiles under
 * its facts and over every tab, as Apple Maps' place card has its photos
 * (the owner's screenshot, 2026-11-10; C1 on the canvas
 * V1d9RDbmY1aczc4LfXed7a, 2026-11-14): the field from the air first, then
 * its runways, then the field from the ground (the owner, 2026-10-29: "make
 * the aerial view as the first image and then next one can be the airport
 * diagram"), the runways first where there is no aerial. A tap on each
 * opens it full screen to pinch in on: the photos and the FAA's diagram on
 * a MapLibre map of their own (ChartViewer), the sketch in SketchViewer.
 */
export function PlacePictures({
  place,
  photos,
  sketchedRunways,
  leftOut,
  noRunwaysPicture,
  onNoRunwaysPicture,
}: {
  place: AirportPlace;
  photos: AirportPhotos | undefined;
  /** The runways sketched, "09/27" each; none where none can be drawn. */
  sketchedRunways: string[];
  /** How many more are not drawn, their ends unsurveyed. */
  leftOut: number;
  noRunwaysPicture: boolean;
  onNoRunwaysPicture: () => void;
}) {
  const [diagramOpen, setDiagramOpen] = useState<"faa" | "sketch" | null>(null);
  const [picture, setPicture] = useState<"aerial" | "photo" | null>(null);
  const ident = place.ident;
  const sketched = sketchedRunways.length > 0;
  const runwaysPicture = runwaysPictureOf(place, noRunwaysPicture);
  // The picture open full screen, made once for it: a new list at each draw
  // of the card (its minute clock, a report asked again, own ship's fix) made
  // the viewer lay its map out again, and a pinch went back to the whole
  // picture under the pilot's fingers (the owner, 2026-11-14: "When I tap on
  // an image, why doesn't it let me zoom in/out?").
  const pages = useMemo(() => {
    if (!picture || !photos) return null;
    return [
      picture === "aerial" || !photos.photo
        ? { src: photos.aerial_url, width: 900, height: 600 }
        : { src: photos.photo.url, width: photos.photo.width ?? 900, height: photos.photo.height ?? 600 },
    ];
  }, [picture, photos]);
  const runwaysSlide = (
    <div className="relative size-full bg-background">
      {sketched ? (
        <div
          role="img"
          data-testid="place-runway-sketch"
          aria-label={`${ident} runways ${sketchedRunways.join(", ")}, north up${leftOut ? `, ${leftOut} more not drawn, their ends unsurveyed` : ""}. ${place.airport_diagram_url ? "Airport diagram" : "Runways sketch"}`}
          className="absolute inset-0"
        >
          {/* The FAA's own diagram, cropped to its runways, where the field
              has one; the card's sketch of them where it has none, or the
              crop cannot be had. */}
          {runwaysPicture ? (
            <img
              src={runwaysPicture}
              alt=""
              onError={onNoRunwaysPicture}
              data-testid="place-diagram-runways"
              // The diagram's white paper round it, black at night: the
              // inversion turns the paper too.
              className="absolute inset-0 size-full bg-white object-cover dark:invert"
            />
          ) : (
            <RunwaySketch runways={place.runways} lat={place.lat} lon={place.lon} />
          )}
        </div>
      ) : (
        <div
          data-testid="place-runway-sketch"
          className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground", TEXT.note)}
        >
          No runways to draw
        </div>
      )}
    </div>
  );
  const slides: (CardSlide | null | undefined)[] = [
    photos && {
      key: "aerial",
      open: () => setPicture("aerial"),
      label: `${ident} from the air, full screen`,
      testId: "place-aerial-open",
      picture: <PhotoSlide src={photos.aerial_url} alt="" label={`${ident} from the air`} testId="place-aerial" />,
    },
    {
      key: "diagram",
      picture: runwaysSlide,
      testId: "place-diagram-open",
      open: sketched ? () => setDiagramOpen(place.airport_diagram_url ? "faa" : "sketch") : undefined,
      label: place.airport_diagram_url ? `${ident} airport diagram, full screen` : `${ident} runways sketch, full screen`,
    },
    photos?.photo && {
      key: "photo",
      open: () => setPicture("photo"),
      label: `${ident} from the ground, full screen`,
      testId: "place-photo-open",
      picture: (
        <PhotoSlide
          src={photos.photo.url}
          alt=""
          label={`${ident} from the ground`}
          testId="place-photo"
          creditTestId="place-photo-credit"
          // Its photographer and licence, as Commons' licences ask.
          credit={`${photos.photo.credit}${photos.photo.license ? ` · ${photos.photo.license}` : ""}`}
        />
      ),
    },
  ];
  return (
    <>
      <div className="pt-4">
        <CardPictures
          slides={slides}
          label={`${ident}: its runways${photos ? ", from the air" : ""}${photos?.photo ? ", from the ground" : ""}`}
          testId="place-pictures"
        />
      </div>
      {/* The pictures' lightboxes (Base UI Dialogs). */}
      {diagramOpen === "faa" && place.airport_diagram_url && (
        <FaaChart title={`${ident} airport diagram`} url={place.airport_diagram_url} airport={ident} onClose={() => setDiagramOpen(null)} />
      )}
      {picture && pages && (
        <Suspense fallback={null}>
          <PictureViewer
            title={`${ident} ${picture === "aerial" ? "from the air" : "from the ground"}`}
            pages={pages}
            onClose={() => setPicture(null)}
          />
        </Suspense>
      )}
      {diagramOpen === "sketch" && (
        <Suspense fallback={null}>
          <SketchViewer ident={ident} runways={place.runways} lat={place.lat} lon={place.lon} onClose={() => setDiagramOpen(null)} />
        </Suspense>
      )}
    </>
  );
}
