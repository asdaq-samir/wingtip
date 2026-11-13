/** A mark drawn as the app's own markup over the map (gl/htmlMarker) --
 *  own ship and the traffic, which move every frame; every other mark is
 *  a symbol layer (gl/useGlSymbols) -- its
 *  html, its box and the point in it that sits on the map's point, px. The
 *  shape of a div icon's options, so the marks read the same wherever
 *  they were written for. */
export interface IconLike {
  options: {
    html: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
    className?: string;
    /** Degrees from north on the chart the mark is turned to, by MapLibre's
     *  map-aligned rotation (Marker `rotationAlignment: "map"`, as own ship
     *  and the wind arrows are), so it keeps pointing along its track as
     *  the map turns under it; none, upright to the screen. */
    rotation?: number;
  };
}

function divIcon(options: IconLike["options"]): IconLike {
  return { options };
}
import { ownShipSvg } from "../position/ownShipLook";
import { text } from "./airportMark";
import { MAP_BLUE } from "./chartColors";
import { CATEGORY_UNKNOWN, CHART } from "../../tokens";

/** An icon made once for the same arguments and handed out again after:
 *  a marker's element is made again only when its icon is a new object
 *  (gl/layers/TrafficGl), and every redraw of the planner made every
 *  marker's anew -- a narrative arriving, a tab opening redrew the
 *  route's chips (measured on the Brief tab's first opening, 2026-10). Plain data in, so the arguments are the key; a few thousand
 *  kept at most. */
function made<A extends unknown[]>(make: (...args: A) => IconLike): (...args: A) => IconLike {
  const kept = new Map<string, IconLike>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    let icon = kept.get(key);
    if (!icon) {
      if (kept.size > 4000) kept.clear();
      icon = make(...args);
      kept.set(key, icon);
    }
    return icon;
  };
}

/**
 * The marks are HTML (gl/htmlMarker places them) -- the same Tailwind
 * classes as the rest of the page, in template strings.
 *
 * Written as JSX and rendered with `renderToStaticMarkup` until it was
 * measured: that one import put the whole of `react-dom/server` (about
 * 200 kB, a second copy of the renderer) into the chunk every page
 * loads, to produce four spans.
 */

/** Own ship's mark as markup and its box, px, nose up: OwnShipGl's marker
 *  turns it to the heading as it draws it, round through a turn as an
 *  airplane comes round, rather than the mark being made again for each
 *  heading. */
export function ownShipHtml(headingDeg: number | null, off: boolean, moving: boolean): { size: number; html: string } {
  // Grey where own ship is off: the last position, no longer watched, as
  // Maps greys its dot when it stops knowing where you are. iOS's blue.
  const fill = off ? CATEGORY_UNKNOWN : MAP_BLUE;
  const beam = moving;
  // The beam's box twice the plane's, the plane at its middle (ownShipSvg).
  const size = beam ? 68 : 34;
  return {
    size,
    html: ownShipSvg(
      fill,
      size,
      `data-own-ship="${off ? "off" : "on"}" data-moving="${beam}" class="absolute left-0 top-0 drop-shadow-md drop-shadow-black/40" style="transform:rotate(${Number(headingDeg ?? 0)}deg)"`,
      beam,
    ),
  };
}

/** How big a traffic airplane's mark is drawn, points: 16, where it was
 *  22, at the owner's ask ("Can traffic arrows be smaller?", 2026-10-28)
 *  -- the chevron drawn in its 22-unit box, scaled, its white casing and
 *  trend line kept their width on screen. */
const TRAFFIC_MARK = 16;

/** An airplane of the traffic (TrafficGl, TracksGl): a chevron turned to its
 *  track on the chart in its colour with a white casing, and a line out
 *  ahead of it to where it will be in a minute (`trendPx` long, as
 *  ForeFlight's TrafficTrend vector). The one being tracked (`tracked`)
 *  ringed in the tint. A tap anywhere in the 44 points round it picks
 *  it. Its words are a mark of their own (trafficTag), so they stay
 *  upright as the map turns the arrow. Track to five degrees and the
 *  line to four points, so the icons made once are a few hundred. */
export const trafficIcon = made((trackDeg: number | null, colour: string, trendPx: number, tracked: boolean) => {
  const half = TRAFFIC_MARK / 2;
  // The trend's screen points in the box's own units.
  const trend = (Math.round(trendPx / 4) * 4 * 22) / TRAFFIC_MARK;
  return divIcon({
    className: "",
    iconSize: [TRAFFIC_MARK, TRAFFIC_MARK],
    iconAnchor: [half, half],
    ...(trackDeg != null && { rotation: Math.round(trackDeg / 5) * 5 }),
    html:
      // The hit area: 44 points round the mark, as every tap target's
      // (index.css), the mark not grown for it.
      `<span class="absolute rounded-full" style="inset:-${(44 - TRAFFIC_MARK) / 2}px" data-traffic-hit=""></span>` +
      (tracked
        ? `<span class="pointer-events-none absolute -inset-[7px] rounded-full border-[2.5px] border-[var(--tint)] bg-white/70 shadow-(--depth-mark)" data-traffic-tracked=""></span>`
        : "") +
      `<svg viewBox="0 0 22 22" width="${TRAFFIC_MARK}" height="${TRAFFIC_MARK}" aria-hidden="true" data-traffic="" overflow="visible"` +
      ` class="pointer-events-none absolute left-0 top-0 overflow-visible drop-shadow-sm drop-shadow-black/50">` +
      (trackDeg != null && trendPx > 0
        ? `<line x1="11" y1="4" x2="11" y2="${Math.round((4 - trend) * 10) / 10}" stroke="${text(colour)}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" data-trend=""/>`
        : "") +
      (trackDeg == null
        ? `<circle cx="11" cy="11" r="5" fill="${text(colour)}" stroke="${CHART.casing}" stroke-width="2" vector-effect="non-scaling-stroke"/>`
        : `<path d="M11 2 L18 19 L11 14.5 L4 19 Z" fill="${text(colour)}" stroke="${CHART.casing}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`) +
      `</svg>`,
  });
});

/** The words under an airplane of the traffic (trafficIcon): its height
 *  (trafficLabel) and its callsign where the map is close enough for
 *  them, the tracked one's callsign always, lower to clear its ring. A
 *  mark of its own on the same point, upright to the screen, so the words
 *  read level however the map and the arrow are turned; empty when there
 *  are none. */
export const trafficTag = made((colour: string, label: string, callsign: string | null, tracked: boolean) => {
  const half = TRAFFIC_MARK / 2;
  return divIcon({
    className: "",
    iconSize: [TRAFFIC_MARK, TRAFFIC_MARK],
    iconAnchor: [half, half],
    html:
      label || callsign
        ? `<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-(--chart-tag)/80 px-1 text-center text-(length:--type-caption) font-bold leading-[14px] text-white tabular-nums"` +
          ` style="top:${tracked ? TRAFFIC_MARK + 6 : TRAFFIC_MARK}px;color:${text(colour === TRAFFIC_COLOURS.near ? CHART.trafficNearText : CHART.casing)}">` +
          `${text(label)}${callsign ? `${label ? "<br>" : ""}<span class="font-semibold text-white/85">${text(callsign)}</span>` : ""}</span>`
        : "",
  });
});

/** Traffic's colours: within 1,000 ft of own ship's height amber, the
 *  rest the ADS-B displays' cyan. */
export const TRAFFIC_COLOURS = { near: CHART.trafficNear, far: CHART.trafficFar } as const;
