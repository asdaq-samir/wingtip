import { useEffect, useMemo } from "react";
import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { AirportPin } from "../../../../lib/api/types";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { glZoom } from "../../../../lib/map/gl/glStyle";
import { GL_FONT_BOLD, LABEL_HALO } from "../../../../lib/map/gl/layers/common";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { weatherMarksOf } from "../../../../lib/map/marks/airportWeather";
import { airportWeatherDrawn, useAirportWeatherPrefs } from "../../../../lib/map/marks/airportWeatherPrefs";
import { WORSE_ID } from "../../../../lib/map/marks/stationModel";
import { useDemonstratedCrosswind } from "../../../../lib/map/marks/useDemonstratedCrosswind";
import { CHART, MAP } from "../../../../lib/tokens";

const SOURCE = "airport-weather";

/** The station model from zoom 10, where the chart's fields stand apart
 *  enough for its lines beside each (the owner's pick, 2026-11-10: "about
 *  10 on web and Android"); with the look Station, from 7, a region's
 *  scale, where the fields' own symbols start keeping only a little apart
 *  (glOverlays' icon-padding) and the lines give way where they don't fit. */
const STATION_CLOSE = MAP.zoomStationClose;
const STATION_ALWAYS = MAP.zoomStationAlways;

const ROTATE_ON_MAP = { "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true } as const;

/** The barb from the field toward where the wind is from, turned by its
 *  direction; a variable wind, which no barb can point, "VRB05" under the
 *  field, red where the barb would be. A gust is left to the field's card,
 *  as the station model leaves it (stationModel's barbSvg). The text gives
 *  way where it doesn't fit; the barb never does. */
const wind = (id: string, filter: ExpressionSpecification): SymbolLayerSpecification => ({
  id,
  type: "symbol",
  source: SOURCE,
  filter,
  layout: {
    "icon-image": ["coalesce", ["get", "barb"], ""] as ExpressionSpecification,
    "icon-rotate": ["get", "dir"],
    ...ROTATE_ON_MAP,
    "text-field": ["get", "variable"],
    "text-font": GL_FONT_BOLD,
    "text-size": 11,
    "text-anchor": "top",
    "text-offset": [0, 1.3],
    "text-padding": 1,
    "text-optional": true,
  },
  paint: { "text-color": ["case", ["get", "over"], CHART.warning, CHART.fixInk] as ExpressionSpecification, ...LABEL_HALO },
});

/** Close in, the station model: every reported wind, calm its circle. */
const BARB = wind("airport-wx-barb", ["any", ["has", "barb"], ["!=", ["get", "variable"], ""]]);

/** Visibility and weather over the ceiling, left of the field (its ident
 *  is to its right); they give way where they don't fit. */
const LINES: SymbolLayerSpecification = {
  id: "airport-wx-lines",
  type: "symbol",
  source: SOURCE,
  filter: ["!=", ["get", "lines"], ""],
  layout: {
    "text-field": ["get", "lines"],
    "text-font": GL_FONT_BOLD,
    "text-size": 11,
    "text-anchor": "right",
    "text-justify": "right",
    "text-offset": [-1.5, 0],
    "text-padding": 1,
  },
  paint: { "text-color": CHART.fixInk, ...LABEL_HALO },
};

/** Farther out, at any zoom the station model is not drawn at, the barb
 *  only where the wind earns it (the engine's wind_arrow), so a region's
 *  calm and light winds don't crowd the chart; none out past a region's
 *  scale, smaller there and growing in, and giving way to one another
 *  rather than piled up (the owner's iPhone at zoom 3, 2026-11-12: the
 *  country one tangle of barbs). */
const FAR_FROM = MAP.zoomBarbFarFrom;
const farWind = wind("airport-wx-wind", ["==", ["get", "far"], true]);
const FAR: SymbolLayerSpecification = {
  ...farWind,
  layout: {
    ...farWind.layout,
    "icon-allow-overlap": false,
    "icon-ignore-placement": false,
    "icon-padding": 2,
    "icon-size": ["interpolate", ["linear"], ["zoom"], glZoom(FAR_FROM), 0.6, glZoom(MAP.zoomBarbFull), 1],
  },
};

/** The amber ↓ at a plan's field whose weather gets worse by the pilot's
 *  time there, at its upper left. */
const WORSE: SymbolLayerSpecification = {
  id: "airport-wx-worse",
  type: "symbol",
  source: SOURCE,
  filter: ["get", "worse"],
  layout: { "icon-image": WORSE_ID, "icon-offset": [-13, -13], "icon-allow-overlap": true, "icon-ignore-placement": true },
};

const LAYERS = [BARB, LINES, FAR, WORSE];

/**
 * The airport weather marks over the chart's fields (the owner's pick,
 * 2026-11-10): the station model's barb and its two lines when zoomed in
 * close (or at every zoom with the look Station), farther out the barb
 * where the engine's wind_arrow gives one (the owner, 2026-11-12: barbs as
 * the Aviation Weather Center's map draws them, in place of the arrows),
 * red past the picked airplane's demonstrated crosswind at every zoom,
 * and the amber ↓ at the plan's fields
 * whose weather gets worse by the pilot's time there. The halo is the
 * airports' own symbols' (glOverlays). Under the airports' layer,
 * so a field's symbol is never covered. The fields are the METARs the map
 * already asks for (AirportsGl), each with its weather.
 */
export default function AirportWeatherGl({ fields, worse }: { fields: AirportPin[]; worse: string[] }) {
  const { map } = useGlMap();
  const show = useAirportWeatherPrefs((s) => s.show);
  const demonstrated = useDemonstratedCrosswind();
  useGlLayer("marks", { [SOURCE]: { type: "geojson", data: EMPTY } }, LAYERS, "airports");
  const data = useMemo<GeoJSON.FeatureCollection>(() => {
    const badged = new Set(worse);
    const features: GeoJSON.Feature[] = [];
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.ident) || (!f.weather && !badged.has(f.ident))) continue;
      seen.add(f.ident);
      const marks = f.weather ? weatherMarksOf(f.weather, demonstrated) : null;
      const properties: Record<string, unknown> = { ident: f.ident, worse: badged.has(f.ident), lines: marks?.lines ?? "" };
      if (marks) {
        Object.assign(properties, { dir: marks.dir, over: marks.over, far: marks.far, variable: marks.variable });
        if (marks.barb) properties.barb = marks.barb;
      }
      features.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: [f.lon, f.lat] } });
    }
    return { type: "FeatureCollection", features };
  }, [fields, worse, demonstrated]);
  useGlData(SOURCE, data);
  // Settings' Airport Weather on the layers: which are drawn, and from
  // which zoom; the amber ↓ with all but Off (its switch went, 2026-11-13).
  // Off hides these four layers; the halo is the airports' own (AirportsGl).
  useEffect(() => {
    if (!map.style) return;
    const { look, stationClose, windArrows } = airportWeatherDrawn(show);
    const off = look === "off";
    const station = look === "station" || stationClose;
    const from = glZoom(look === "station" ? STATION_ALWAYS : STATION_CLOSE);
    const shown = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    for (const id of [BARB.id, LINES.id]) {
      shown(id, station && !off);
      if (map.getLayer(id)) map.setLayerZoomRange(id, from, 24);
    }
    // Farther out, the barbs the wind earns; close in the station model's
    // own, every wind.
    shown(FAR.id, windArrows && !off);
    if (map.getLayer(FAR.id)) map.setLayerZoomRange(FAR.id, glZoom(FAR_FROM), station ? from : 24);
    shown(WORSE.id, !off);
  }, [map, show]);
  // The specs' view of the marks drawn (data-airport-weather, useGlProbe).
  useGlProbe("airport-weather", [BARB.id, LINES.id, FAR.id, WORSE.id], (f) => ({
    ident: f.properties.ident,
    layer: f.layer.id,
    over: f.properties.over === true,
  }));
  return null;
}
