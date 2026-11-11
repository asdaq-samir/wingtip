import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import type { ProcedureDrawing } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import { TAP } from "../../lib/map/gl/layers/common";
import { useGlLayer, useGlMap, useGlPaint, useGlTap } from "../../lib/map/gl/glLayer";
import { useGlLines, type GlRun } from "../../lib/map/gl/useGlLines";
import { useGlMarks, type GlMark } from "../../lib/map/gl/useGlMarks";
import { usePreferences } from "../../lib/preferences";
import { plateQuery } from "../../lib/queryClient";
import { CHART } from "../../lib/tokens";
import { PlateCard, type ChartViewer } from "./PlateCard";
import { plateKey, useHiddenPlates, usePlateLook } from "./plateLook";
import { plateTagIcon } from "./plateTagIcon";
import { tagViews } from "./plateTags";

type Corner = [number, number];
type Corners = [Corner, Corner, Corner, Corner];

/** Where a tap on a plate stands among the map's taps: after every mark
 *  and the route's legs (legTap's LEG_RANK), and before the airspace's
 *  lines and areas, which the page is drawn over. */
const PLATE_RANK = TAP.rank.line - 0.25;

/**
 * Each approach picked on the route, its FAA plate laid on the chart as
 * ForeFlight lays one (the owner's screenshots, 2026-11-11): the whole page
 * between the four corners the planner places it by (PlateOverlay.page,
 * wingtip.plate_page), its plan view where the plate's own georeference
 * puts it and the rest of the page round it at the same scale; where the
 * page could not be placed, the plan view alone in its box. Over the chart
 * and its airspace, under the route and the procedure's lines; as solid,
 * and inverted for the night, as the plate's card sets (usePlateLook); a
 * tap on it opens that card. With Show Annotations, each fix of the
 * approach tagged and the final segment marked (PlateTagsGl).
 */
export function PlatesGl({ drawings, viewer }: { drawings: ProcedureDrawing[]; viewer: ChartViewer }) {
  const shown = usePreferences((s) => s.plates);
  const hidden = useHiddenPlates((s) => s.keys);
  const approaches = useMemo(() => drawings.filter((d) => d.kind === "approach"), [drawings]);
  // An approach picked again brings its hidden plate back.
  const keys = approaches.map((d) => plateKey(d.airport, d.id));
  const before = useRef<string[]>([]);
  const keysJoined = keys.join();
  useEffect(() => {
    const now = keysJoined ? keysJoined.split(",") : [];
    useHiddenPlates.getState().picked(now, before.current);
    before.current = now;
  }, [keysJoined]);
  const drawn = shown ? approaches.filter((d) => !hidden.includes(plateKey(d.airport, d.id))) : [];
  const plates = useQueries({ queries: drawn.map((d) => plateQuery(d.airport, d.id)) });
  return (
    <>
      {plates.map((q, i) => {
        const p = q.data,
          d = drawn[i]!;
        if (!p) return null;
        const key = plateKey(d.airport, d.id);
        const at = (path: string) =>
          `${window.location.origin}/api/planner/${path}/${encodeURIComponent(p.cycle)}/${encodeURIComponent(d.airport)}/${encodeURIComponent(d.id)}.png`;
        const page = p.page;
        const corners: Corners | null = page
          ? [
              [page.top_left.lon, page.top_left.lat],
              [page.top_right.lon, page.top_right.lat],
              [page.bottom_right.lon, page.bottom_right.lat],
              [page.bottom_left.lon, page.bottom_left.lat],
            ]
          : [p.south, p.west, p.north, p.east].every(Number.isFinite)
            ? [
                [p.west, p.north],
                [p.east, p.north],
                [p.east, p.south],
                [p.west, p.south],
              ]
            : null;
        if (!corners) return null;
        return (
          <Plate
            key={`${key}-${page ? "page" : "plan"}`}
            id={`plate-${d.airport}-${d.id}`}
            url={at(page ? "approach-plate-page" : "approach-plate")}
            corners={corners}
            whole={!!page}
            onTap={(openCard) => openCard(<PlateCard key={key} airport={d.airport} id={d.id} viewer={viewer} />)}
          />
        );
      })}
      {drawn.map((d) => (
        <PlateTagsGl key={plateKey(d.airport, d.id)} drawing={d} />
      ))}
    </>
  );
}

/** One plate: its picture on its four corners, and a clear fill on the
 *  same corners that takes a tap (a raster has no features to tap). The
 *  plan view alone, black on clear, keeps a white sheet under it. */
function Plate({
  id,
  url,
  corners,
  whole,
  onTap,
}: {
  id: string;
  url: string;
  corners: Corners;
  whole: boolean;
  onTap: (openCard: ReturnType<typeof useGlMap>["openCard"]) => void;
}) {
  const { openCard } = useGlMap();
  const { opacity, inverted } = usePlateLook();
  useGlLayer(
    "lines",
    {
      [`${id}-sheet`]: {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...corners, corners[0]]] } },
      },
      [id]: { type: "image", url, coordinates: corners },
    },
    [
      { id: `${id}-sheet`, type: "fill", source: `${id}-sheet`, paint: { "fill-color": CHART.casing, "fill-opacity": 0 } },
      { id, type: "raster", source: id, paint: { "raster-fade-duration": 0 } },
    ],
  );
  // The page's own white is its paper; the plan view's sheet is drawn
  // under it, dark when the colours are inverted.
  useGlPaint([`${id}-sheet`], { "fill-opacity": whole ? 0 : 0.8 * opacity, "fill-color": inverted ? CHART.tag : CHART.casing });
  // Inverted by swapping the raster's brightness ends: white is drawn
  // black and black white, the night's plate (MapLibre's raster paint).
  useGlPaint([id], { "raster-opacity": opacity, "raster-brightness-min": inverted ? 1 : 0, "raster-brightness-max": inverted ? 0 : 1 });
  useGlTap([`${id}-sheet`], 1, PLATE_RANK, () => onTap(openCard));
  return null;
}

/** The approach's fixes tagged and its final segment marked in the
 *  final approach's cyan (design/tokens.json), while Show Annotations is
 *  on: the engine's figures (approach_fix_tags), the map's drawing. */
function PlateTagsGl({ drawing }: { drawing: ProcedureDrawing }) {
  const annotations = usePlateLook((s) => s.annotations);
  const answer = useMemo(() => (annotations ? callEngine("approach_fix_tags", { drawing }) : null), [annotations, drawing]);
  const runs = useMemo<GlRun[] | null>(
    () =>
      answer?.final
        ? [{ points: answer.final.points, colour: CHART.finalApproach, width: 4, name: `final-${drawing.airport}-${drawing.id}` }]
        : null,
    [answer, drawing],
  );
  useGlLines(`plate-final-${drawing.airport}-${drawing.id}`, "route", runs, { colour: CHART.casing, width: 8, opacity: 0.9 });
  const marks = useMemo<GlMark[]>(
    () =>
      answer
        ? tagViews(answer.tags).map((t) => ({
            key: `plate-tag-${drawing.airport}-${drawing.id}-${t.key}`,
            lat: t.lat,
            lon: t.lon,
            icon: plateTagIcon({ ident: t.ident, lines: t.lines }),
          }))
        : [],
    [answer, drawing],
  );
  useGlMarks(marks);
  return null;
}
