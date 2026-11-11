/** A mark drawn as the app's own markup over the map (gl/htmlMarker): its
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

export function divIcon(options: IconLike["options"]): IconLike {
  return { options };
}
import { ownShipSvg, type OwnShipLook } from "../position/ownShipLook";
import type { AirspaceClass } from "../../preferences";
import { inkOn } from "../../scoreScale";
import { AIRPORT_MARK, airportMarkSvg, text } from "./airportMark";
import { MAP_BLUE, WAYPOINT_MAGENTA } from "./chartColors";
import { CATEGORY_UNKNOWN, CHART } from "../../tokens";

/** An icon made once for the same arguments and handed out again after:
 *  a marker's element is made again only when its icon is a new object
 *  (gl/layers/MarksGl), and every redraw of the planner made every
 *  marker's anew -- a narrative arriving, a tab opening redrew the
 *  route's chips (measured on the Brief tab's first opening, 2026-10). Plain data in, so the arguments are the key; a few thousand
 *  kept at most. */
export function made<A extends unknown[]>(make: (...args: A) => IconLike): (...args: A) => IconLike {
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

/** A target a finger's 44 points across (Apple's Human Interface
 *  Guidelines), for the marks drawn small: a waypoint's diamond. A chip's
 *  target is the chip, where its neighbours' are close: grown to 44 every
 *  chip's box lay over the next one's, and a tap on a chip in sight went
 *  to the one beside it (KORD's, under a neighbour's, 2026-10-07). A tap a
 *  little off a field's chip is its own all the same: the map gives a tap
 *  to the nearest mark within a finger's reach (gl/layers/common's TAP). */
const TAP = 44;

/**
 * A marker with three edges: a white casing to separate it from dark
 * linework, a dark hairline outside that so it still separates from pale
 * paper, and a shadow to lift it off both. One edge is never enough on a
 * chart this busy.
 */
export const dotIcon = made(function dotIcon(fill: string, label?: string | number) {
  const withLabel = label !== undefined;
  // The tap target (iconSize) is bigger than the visual dot on purpose --
  // a 20px dot is well under a comfortable touch target, but making the
  // dot itself that big would make dense stretches of route hard to read.
  // Centred in a larger invisible box by `position: absolute` and a
  // transform.
  const tapSize = withLabel ? 36 : 32;
  // leading-none and text-(length:--type-caption): a circle has less usable width near
  // its edges than a square of the same size, so bold digits (a
  // route's checkpoint count runs to three) need real headroom to stay
  // inside the curve, and a browser's own line-height slack would sit
  // the number off-centre. 11px is Apple's floor for text meant to be
  // read; these were 8, and they are the numbers a pilot matches to
  // the nav log.
  const size = withLabel
    ? "grid h-[24px] w-[24px] place-items-center text-(length:--type-caption) font-bold leading-none tracking-tight"
    : "h-4 w-4";
  return divIcon({
    className: "",
    iconSize: [tapSize, tapSize],
    iconAnchor: [tapSize / 2, tapSize / 2],
    html:
      `<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-background shadow-(--depth-mark) outline outline-1 outline-(color:--chart-shade)/55 ${size}"` +
      ` style="background-color:${text(fill)};color:${text(inkOn(fill))}">${withLabel ? text(label) : ""}</div>`,
  });
});

/** Own ship's mark as markup and its box, px, nose up: OwnShipGl's marker
 *  turns it to the heading as it draws it, round through a turn as an
 *  airplane comes round, rather than the mark being made again for each
 *  heading. The arrow with no heading, or off, is a dot. */
export function ownShipHtml(headingDeg: number | null, off: boolean, look: OwnShipLook, moving: boolean): { size: number; html: string } {
  // Grey where own ship is off: the last position, no longer watched, as
  // Maps greys its dot when it stops knowing where you are. iOS's blue.
  const fill = off ? CATEGORY_UNKNOWN : MAP_BLUE;
  const plane = look !== "arrow";
  const beam = plane && moving;
  // The beam's box twice the plane's, the plane at its middle (ownShipSvg).
  const size = beam ? 68 : plane ? 34 : 28;
  return {
    size,
    html:
      !plane && (headingDeg === null || off)
        ? `<div data-own-ship="${off ? "off" : "on"}" class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-(--depth-mark)" style="background:${fill}"></div>`
        : ownShipSvg(
            look,
            fill,
            size,
            `data-own-ship="${off ? "off" : "on"}" data-look="${look}" data-moving="${beam}" class="absolute left-0 top-0 drop-shadow-md drop-shadow-black/40" style="transform:rotate(${Number(headingDeg ?? 0)}deg)"`,
            beam,
          ),
  };
}

/** A point the route flies through or works out -- a VFR or GPS waypoint,
 *  a present position (POS0), a top of climb or descent -- as a pill on
 *  the course itself, centred on its point: the chart's magenta diamond
 *  of a fix and its name, white edged in the magenta (the owner's "TOC and
 *  TOD should have the fix on the course for those labels. Just like that
 *  POS0 should have a fix symbol with a label POS0"; "still make those
 *  route labels as pills"; and, of the pill beside the diamond, "a bit
 *  off their position", 2026-10-26). Never moved off its point to clear
 *  another label: that put TOC off the line. */
export const fixMarkIcon = made(function fixMarkIcon(label: string) {
  return divIcon({
    className: "",
    iconSize: [TAP, TAP],
    iconAnchor: [TAP / 2, TAP / 2],
    html:
      `<span class="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border-2 bg-white py-0.5 pr-1.5 pl-1 text-(length:--type-caption) leading-none font-bold text-(color:--chart-fix-ink) shadow-sm"` +
      ` style="border-color:${WAYPOINT_MAGENTA}">` +
      `<span class="size-2 shrink-0 rotate-45 rounded-[1px]" style="background-color:${WAYPOINT_MAGENTA}"></span>${text(label)}</span>`,
  });
});

/**
 * An airport on the map, at the pilot's ask, as ForeFlight marks them
 * from the sectional's own symbols: a ring with four ticks (the chart's
 * sign of a field with services) in the look its airspace has
 * everywhere in the planner (lib/useAirspace) -- Class B a solid blue
 * disc, C a solid magenta one, D a dashed blue ring, an E surface area a
 * dashed magenta ring, G a thin magenta ring, and grey until the class is
 * known. A field the armed services keep is an M on a blue disc, and one
 * closed to the public an R on a magenta one (the sectional's R in a
 * circle), at the pilot's ask, whatever the airspace over either -- the
 * disc alone, as asked: a ring of the airspace's colour round it was tried
 * and taken off, the card saying the class. In its
 * middle (at the disc's edge on the M and the R) a dot in the
 * colour of the field's weather, its METAR's flight category, grey with
 * no report, kept from the chips the map had, at the pilot's ask. Its
 * ident beside it, dark on a white halo, as the chart letters a field.
 * White casing round each line, as on every mark here: a coloured line
 * alone is lost on chart of the same hue.
 */
export const airportMarkIcon = made(function airportMarkIcon(
  ident: string,
  space: AirspaceClass | null,
  weather: string,
  use: "military" | "private" | null = null,
) {
  const half = AIRPORT_MARK / 2;
  return divIcon({
    className: "",
    iconSize: [AIRPORT_MARK, AIRPORT_MARK],
    iconAnchor: [half, half],
    html:
      airportMarkSvg(space, weather, use, "absolute inset-0 overflow-visible drop-shadow-sm drop-shadow-black/35") +
      `<span class="absolute top-1/2 left-[calc(100%+1px)] -translate-y-1/2 whitespace-nowrap text-(length:--type-caption) leading-none font-bold text-(color:--chart-fix-ink) [text-shadow:0_0_2px_var(--chart-casing),0_0_2px_var(--chart-casing),0_0_3px_var(--chart-casing),0_0_4px_var(--chart-casing)]">${text(ident)}</span>`,
  });
});

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
