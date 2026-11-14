import type { ExpressionSpecification, LineLayerSpecification, Map as MlMap, SymbolLayerSpecification } from "maplibre-gl";
import { drawSvg } from "../../../../lib/map/gl/glLayer";
import { GL_FONT_BOLD } from "../../../../lib/map/gl/layers/common";
import { MAP_BLUE } from "../../../../lib/map/marks/chartColors";
import { TRAFFIC_COLOURS } from "../../../../lib/map/marks/icons";
import { CHART } from "../../../../lib/tokens";

/*
 * The traffic's marks as MapLibre's own layers, the map's stock symbols
 * rather than an HTML marker an airplane (the owner, 2026-11-12: "I don't
 * want to have bugs with hand built things"): each airplane the chevron
 * turned to its track (`icon-rotate`), or a dot with no track, in its
 * colour with a white casing, ringed in the map's blue while it is
 * tracked; its height and call sign under it in a dark tag that stays
 * upright (a symbol of its own, `icon-text-fit` round the words); and on
 * the flat map a line out ahead to where it will be in a minute (a line
 * layer, ForeFlight's TrafficTrend vector). Each stands at `alt_m`
 * (MapLibre's `symbol-height-offset`, metres above the sea), nothing on
 * the flat map, so the 3D view can draw the same layers with only the
 * height changed. Collision off for all of them: every target is drawn,
 * as a traffic display draws every one.
 */

/** The features' properties, as the layers read them. */
export interface TrafficMarkProps {
  hex: string;
  /** Its picture (trafficPicture). */
  icon: string;
  /** Its track, degrees true; 0 for a dot. */
  track: number;
  tracked: boolean;
  /** Dimmed: a list's own picks shown, this one not among them. */
  /** Its height against own ship's (trafficLabel), "" where not shown. */
  label: string;
  /** Its call sign, "" where not shown. */
  callsign: string;
  /** The words' colour: amber within 1,000 ft of own ship, else white. */
  ink: string;
  /** Where it stands, metres MSL: 0 on the flat map. */
  alt_m: number;
}

/** How big the chevron is drawn, points (icons.ts TRAFFIC_MARK): 16, at
 *  the owner's ask ("Can traffic arrows be smaller?", 2026-10-28). */
const MARK = 16;
/** The picture's box, points: room for the tracked ring (7 out from the
 *  chevron's box, 2.5 wide) and its shadow round the 16. */
const BOX = 34;
/** The words' size and line, points (--type-caption, 14 a line). */
const TAG_SIZE = 11;
const TAG_LINE = 14;
/** The tag's top under the airplane's middle, and how far its box is
 *  drawn inside MapLibre's line box, points. */
const TAG_TOP = 22;
const TAG_INSET = 4;

/** A target's picture's id: its colour, a chevron where it reports a
 *  track (else a dot), and ringed where it is tracked. */
export const trafficPicture = (near: boolean, hasTrack: boolean, tracked = false) =>
  `traffic|${near ? "near" : "far"}|${hasTrack ? "arrow" : "dot"}${tracked ? "|tracked" : ""}`;
const TAG_PICTURE = "traffic|tag";

/** Every picture the marks wear, as SVG: icons.ts trafficIcon's chevron
 *  and dot with their white casing and soft shadow (drop-shadow-sm at
 *  half the chart's shade), the tracked ring white at 70% inside a 2.5-point ring of
 *  the map's blue (MAP_BLUE, as Maps marks a point held), and the tag's
 *  box, the chart's tag colour at 80% with 4-point corners, stretched to
 *  its words. */
function pictures(): [string, string, { inset: number }?][] {
  const half = BOX / 2;
  const shadow = `<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="${CHART.shade}" flood-opacity="0.5"/></filter>`;
  const ring = `<circle cx="${half}" cy="${half}" r="${MARK / 2 + 7 - 1.25}" fill="${CHART.casing}" fill-opacity="0.7" stroke="${MAP_BLUE}" stroke-width="2.5"/>`;
  const out: [string, string, { inset: number }?][] = [];
  for (const near of [true, false])
    for (const arrow of [true, false])
      for (const tracked of [true, false]) {
        const fill = near ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far;
        const body = arrow
          ? `<path d="M11 2 L18 19 L11 14.5 L4 19 Z" fill="${fill}" stroke="${CHART.casing}" stroke-width="2" stroke-linejoin="round"/>`
          : `<circle cx="11" cy="11" r="5" fill="${fill}" stroke="${CHART.casing}" stroke-width="2"/>`;
        const at = half - MARK / 2;
        out.push([
          trafficPicture(near, arrow, tracked),
          `<svg width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}"><defs>${shadow}</defs>${tracked ? ring : ""}` +
            `<g filter="url(#s)"><svg x="${at}" y="${at}" width="${MARK}" height="${MARK}" viewBox="0 0 22 22" overflow="visible">${body}</svg></g></svg>`,
        ]);
      }
  out.push([
    TAG_PICTURE,
    `<svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="4" fill="${CHART.tag}" fill-opacity="0.8"/></svg>`,
    { inset: 4 },
  ]);
  return out;
}

/** The pictures added to the map once, at the screen's density; again
 *  after a style change has cleared them. */
export function addTrafficPictures(map: MlMap) {
  for (const [id, svg, stretch] of pictures())
    void drawSvg(svg, stretch).then((d) => {
      if (d && map.style && !map.hasImage(id)) map.addImage(id, d.image, d.options);
    });
}

/** The tracked one over the rest. */
const SORT: ExpressionSpecification = ["case", ["get", "tracked"], 1, 0];

/** The layers, drawn from one GeoJSON source of points (TrafficMarkProps)
 *  and, on the flat map, one of trend lines (`colour`). */
export function trafficLayers(ids: { marks: string; tags: string; trends: string }, sources: { points: string; trends: string }) {
  const trends: LineLayerSpecification = {
    id: ids.trends,
    type: "line",
    source: sources.trends,
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "colour"], "line-width": 2 },
  };
  const marks: SymbolLayerSpecification = {
    id: ids.marks,
    type: "symbol",
    source: sources.points,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-rotate": ["get", "track"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": SORT,
      "symbol-height-offset": ["get", "alt_m"],
      "symbol-height-anchor": "absolute",
    },
  };
  // Its words under the chevron, the tracked one's under its ring: the
  // tag's top 22 points under the middle, 28 when ringed, where the HTML
  // tag stood (measured in WebKit, 2026-11-12). MapLibre's line box is a
  // few points taller than the page's 14, so the box is drawn 4 in.
  const tags: SymbolLayerSpecification = {
    id: ids.tags,
    type: "symbol",
    source: sources.points,
    filter: ["any", ["!=", ["get", "label"], ""], ["!=", ["get", "callsign"], ""]],
    layout: {
      "text-field": [
        "format",
        ["get", "label"],
        { "text-color": ["get", "ink"] },
        ["case", ["all", ["!=", ["get", "label"], ""], ["!=", ["get", "callsign"], ""]], "\n", ""],
        {},
        ["get", "callsign"],
        { "text-color": `${CHART.casing}d9` },
      ],
      "text-font": GL_FONT_BOLD,
      "text-size": TAG_SIZE,
      "text-line-height": TAG_LINE / TAG_SIZE,
      "text-anchor": "top",
      "text-offset": [
        "case",
        ["get", "tracked"],
        ["literal", [0, (TAG_TOP + 6 - TAG_INSET) / TAG_SIZE]],
        ["literal", [0, (TAG_TOP - TAG_INSET) / TAG_SIZE]],
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "icon-image": TAG_PICTURE,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [-TAG_INSET, 4, -TAG_INSET, 4],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": SORT,
      "symbol-height-offset": ["get", "alt_m"],
      "symbol-height-anchor": "absolute",
    },
  };
  return [trends, marks, tags];
}
