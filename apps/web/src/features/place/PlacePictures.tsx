import { lazy, Suspense, useMemo, useState } from "react";
import { cn } from "cn";
import { CardPictures, type CardSlide } from "../../components/CardPictures";
import { PhotoCredit, PhotoSlide } from "../../components/PictureSlides";
import type { AirportPhotos, AirportPlace } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { NO_CONNECTION } from "../../lib/problems";
import { useOnline } from "../../lib/kept/useOnline";
import { Skeleton } from "../../components/ui/skeleton";
import { FaaChart } from "../../components/AirportDiagram";
import { RunwaySketch } from "./RunwaySketch";
import { useNotamMarks } from "./notamBadges";
import { closedByNotam, runwaysPictureOf, withNotamClosures } from "./runwayPicks";

const SketchViewer = lazy(() => import("./SketchViewer"));
const PictureViewer = lazy(() => import("../../components/AirportDiagramViewer")); // the pictures behind the diagram, full screen to pinch in on

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
  photosPending = false,
  photosUnhad = false,
  sketchedRunways,
  leftOut,
  noRunwaysPicture,
  onNoRunwaysPicture,
}: {
  place: AirportPlace;
  photos: AirportPhotos | undefined;
  /** The photos still asked: the aerial's place held first meanwhile. */
  photosPending?: boolean;
  /** The photos asked and not had (offline, the planner failing), where
   *  the field may well have them: their place kept, saying why. */
  photosUnhad?: boolean;
  /** The runways sketched, "09/27" each; none where none can be drawn. */
  sketchedRunways: string[];
  /** How many more are not drawn, their ends unsurveyed. */
  leftOut: number;
  noRunwaysPicture: boolean;
  onNoRunwaysPicture: () => void;
}) {
  const [diagramOpen, setDiagramOpen] = useState<"faa" | "sketch" | null>(null);
  const [picture, setPicture] = useState<"aerial" | "photo" | null>(null);
  // The sketch's numbers as written (RunwaySketch's onWritten), for its
  // tile's name: the words in sight are in the name a pilot's voice
  // control is told to tap (WCAG 2.5.3, Label in Name).
  const [written, setWritten] = useState("");
  const online = useOnline();
  const ident = place.ident;
  const sketched = sketchedRunways.length > 0;
  // Its runways closed where the Runways tab says Closed, NOTAMs in force
  // as well as the FAA's data (withNotamClosures). The FAA's diagram is
  // drawn for the cycle and knows nothing of a NOTAM's closure, so while one
  // is in force the sketch is shown, which crosses the runway, or the part
  // of it closed, out.
  const marks = useNotamMarks(ident, place);
  const runways = withNotamClosures(place.runways, marks);
  const runwaysPicture = closedByNotam(marks) ? null : runwaysPictureOf(place, noRunwaysPicture);
  const closedWords = runways.filter((r) => r.closed && r.ends).map((r) => r.ends);
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
          aria-label={`${ident} runways ${sketchedRunways.join(", ")}, north up${closedWords.length ? `, ${closedWords.join(", ")} closed` : ""}${leftOut ? `, ${leftOut} more not drawn, their ends unsurveyed` : ""}. ${runwaysPicture ? "Airport diagram" : "Runways sketch"}`}
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
            <RunwaySketch runways={runways} lat={place.lat} lon={place.lon} onWritten={setWritten} />
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
    // The aerial's tile held first while the photos are asked: the
    // diagram alone took the card's whole width, then shrank to 70% when
    // they came, and the aerial, coming later, went after it. Held too,
    // still and saying why, where they could not be had (offline on the
    // ramp, the planner's photos failing): the diagram grew from 70% to the
    // card's width as the skeleton went, and they fill the
    // tile in place when the query asks again and has them.
    !photos && (photosPending || photosUnhad)
      ? {
          key: "aerial",
          label: `${ident} from the air, ${photosPending ? "coming" : "not to be had"}`,
          picture: photosPending ? (
            <Skeleton className="size-full rounded-none" />
          ) : (
            <div
              className={cn("flex size-full items-center justify-center text-muted-foreground", TEXT.note)}
              data-testid="place-aerial-unhad"
            >
              {online ? "Photos could not be fetched" : NO_CONNECTION}
            </div>
          ),
        }
      : null,
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
      // The sketch's numbers in its name while it is drawn, the FAA's
      // diagram there or not (its picture not to be had, or a NOTAM's
      // closure in force).
      label: `${ident} ${place.airport_diagram_url ? "airport diagram" : "runways sketch"}${!runwaysPicture && written ? `, ${written}` : ""}, full screen`,
    },
    photos?.photo && {
      key: "photo",
      open: () => setPicture("photo"),
      label: `${ident} from the ground, full screen`,
      picture: <PhotoSlide src={photos.photo.url} alt="" label={`${ident} from the ground`} testId="place-photo" />,
      // Its photographer and licence, linked to its page, as Commons' licences ask.
      credit: (
        <PhotoCredit
          credit={`${photos.photo.credit}${photos.photo.license ? ` · ${photos.photo.license}` : ""}`}
          href={photos.photo.source_url ?? undefined}
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
          <SketchViewer ident={ident} runways={runways} lat={place.lat} lon={place.lon} onClose={() => setDiagramOpen(null)} />
        </Suspense>
      )}
    </>
  );
}
