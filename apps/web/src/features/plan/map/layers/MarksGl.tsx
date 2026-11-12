import type { CircleLayerSpecification } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ChartInfo } from "../../../../lib/api/types";
import { usePreferences } from "../../../../lib/preferences";
import { classBQuery } from "../../../../lib/queryClient";
import { useAhead } from "../../../../lib/map/position/ahead";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { fieldMarkPicture } from "../../../../lib/map/marks/markPictures";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { chartPair, sheetAt } from "../../../../lib/map/sources/tiles";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { glZoom } from "../../../../lib/map/gl/glStyle";
import { labelledLayer } from "../../../../lib/map/gl/markLayers";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { useGlSymbols, type GlSymbol } from "../../../../lib/map/gl/useGlSymbols";
import { useGlLines, type GlRun } from "../../../../lib/map/gl/useGlLines";
import { CHART } from "../../../../lib/tokens";

const CLASS_B = "class-b-fields";
/** Each field's mark and its ident on the chart's halo. */
const CLASS_B_LAYERS = [labelledLayer(CLASS_B, CLASS_B)];

/**
 * The Class B fields' weather, as marks over the chart, at
 * the settings' Class B Weather: a tap the field's card; a hover shows the
 * terminal sheet over it while the pointer is there.
 */
export function ClassBGl({
  chart,
  route,
  onPreview,
  onSelectPlace,
}: {
  chart: ChartInfo;
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
                  else map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), glZoom(overlayFromZoom)), duration: 600 });
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

/**
 * What is ahead of own ship in the air (lib/map/position/ahead): each
 * alert's point ringed in its level's colour, a dashed line out to it
 * from own ship where it is not already inside.
 */
/** The alerts' inks: a warning red, a caution amber. */
const AHEAD_INK = { warning: CHART.warning, caution: CHART.caution } as const;

export function AheadGl() {
  const ahead = useAhead();
  // The fix only where a line is drawn to an alert outside it, else
  // whether there is one: the rings stand still while the airplane moves,
  // and were sent to the map's worker again at every fix.
  const lined = !!ahead?.alerts.some((a) => !a.inside);
  const fix = useOwnShip((s) => (lined ? s.fix : null));
  const hasFix = useOwnShip((s) => s.fix !== null);
  const runs = useMemo<GlRun[] | null>(
    () =>
      ahead && fix
        ? ahead.alerts
            .filter((a) => !a.inside)
            .map((a) => ({
              points: [
                [fix.lat, fix.lon],
                [a.lat, a.lon],
              ] as [number, number][],
              colour: AHEAD_INK[a.level],
              width: 2,
            }))
        : null,
    [ahead, fix],
  );
  useGlLines("ahead", "top", runs, null, [3, 3]);
  useGlLayer("top", { [AHEAD]: { type: "geojson", data: EMPTY } }, [AHEAD_RINGS]);
  const rings = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      ahead && hasFix
        ? {
            type: "FeatureCollection",
            features: ahead.alerts.map((a) => ({
              type: "Feature",
              properties: { id: a.id, level: a.level },
              geometry: { type: "Point", coordinates: [a.lon, a.lat] },
            })),
          }
        : null,
    [ahead, hasFix],
  );
  useGlData(AHEAD, rings);
  // The rings drawn, by level, for the browser tests.
  useGlProbe("ahead-rings", [AHEAD], (f) => ({ level: f.properties.level }));
  return null;
}

const AHEAD = "ahead-rings";
/** An alert's ring, a circle in its level's colour over a wash of it (a
 *  quarter of the ink), 22 points across. */
const AHEAD_RINGS: CircleLayerSpecification = {
  id: AHEAD,
  type: "circle",
  source: AHEAD,
  paint: {
    "circle-radius": 9.5,
    "circle-color": ["match", ["get", "level"], "warning", AHEAD_INK.warning, AHEAD_INK.caution],
    "circle-opacity": 0.25,
    "circle-stroke-color": ["match", ["get", "level"], "warning", AHEAD_INK.warning, AHEAD_INK.caution],
    "circle-stroke-width": 3,
  },
};
