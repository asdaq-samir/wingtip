import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ChartInfo } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { classBQuery } from "../../../queryClient";
import { colourOf } from "../../marks/flightCategory";
import { fieldMarkPicture } from "../../marks/markPictures";
import { chartPair, sheetAt } from "../../sources/tiles";
import { useGlMap } from "../glLayer";
import { cameraOf } from "../camera";
import { glZoom } from "../glStyle";
import { labelledLayer } from "../markLayers";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";

const CLASS_B = "class-b-fields";
/** Each field's mark and its ident on the chart's halo. */
const CLASS_B_LAYERS = [labelledLayer(CLASS_B, CLASS_B)];

/**
 * The Class B fields' weather, as marks over the chart, at the route's
 * ••• menu's Class B Weather, on the planner's map and the training map alike: a
 * tap the field's card where the map has one (`onSelectPlace`), and on
 * the training map, which has none, the map goes to the field at the zoom
 * its terminal chart starts at; a hover shows the terminal sheet over it
 * while the pointer is there.
 */
export function ClassBGl({
  chart,
  route,
  onPreview,
  onSelectPlace,
}: {
  chart: ChartInfo;
  /** The route's own fields, which wear their own marks. */
  route: string[];
  onPreview: (on: boolean) => void;
  onSelectPlace?: (ident: string) => void;
}) {
  const { map } = useGlMap();
  const show = usePreferences((s) => s.classB);
  const base = usePreferences((s) => s.base);
  const { overlay } = chartPair(chart.chart_layers, base);
  const overlayFromZoom = overlay?.min_zoom ?? 10;
  const { data } = useQuery({ ...classBQuery, enabled: show });
  const marks = useMemo<GlSymbol[]>(
    () =>
      show && data
        ? data
            .filter((a) => !route.includes(a.ident))
            .map((a) => {
              const sheet = sheetAt(overlay, a.lat, a.lon);
              return {
                key: a.ident,
                lat: a.lat,
                lon: a.lon,
                text: a.ident,
                picture: fieldMarkPicture("B", colourOf(a.flight_category)),
                props: { title: `${a.ident} · ${a.name} · ${a.flight_category ?? "no report"}`, weather: colourOf(a.flight_category) },
                onHover: (on: boolean) => onPreview(on && !!sheet),
                onTap: () => {
                  onPreview(false);
                  if (onSelectPlace) onSelectPlace(a.ident);
                  else cameraOf(map).pick([a.lon, a.lat], { zoom: Math.max(map.getZoom(), glZoom(overlayFromZoom)), duration: 600 });
                },
              };
            })
        : [],
    [show, data, route, overlay, overlayFromZoom, onPreview, onSelectPlace, map],
  );
  useGlSymbols(CLASS_B, CLASS_B_LAYERS, marks);
  // Every field given, in sight or not, for the browser tests (the probe
  // has only those drawn in the view): their idents and weather colours.
  useEffect(() => {
    map.getContainer().dataset.classBFields = JSON.stringify(marks.map((m) => ({ ident: m.text, weather: m.props?.weather })));
  }, [map, marks]);
  return null;
}
