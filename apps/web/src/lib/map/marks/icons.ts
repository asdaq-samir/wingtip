import { ownShipSvg } from "../position/ownShipLook";
import type { OwnShipLook } from "../../preferences";
import { MAP_BLUE } from "./chartColors";
import { CATEGORY_UNKNOWN, CHART } from "../../tokens";

/**
 * Own ship's mark is HTML, the map's one marker (gl/layers/ownShipMarker
 * places it) -- the same Tailwind classes as the rest of the page, in a
 * template string; every other mark is a symbol layer (gl/useGlSymbols).
 *
 * Written as JSX and rendered with `renderToStaticMarkup` until it was
 * measured: that one import put the whole of `react-dom/server` (about
 * 200 kB, a second copy of the renderer) into the chunk every page
 * loads, to produce four spans.
 */

/** Own ship's mark as markup and its box, px, nose up: OwnShipGl's marker
 *  turns it to the heading as it draws it, round through a turn as an
 *  airplane comes round, rather than the mark being made again for each
 *  heading, in the look picked (the Map card's Own Ship); the arrow with no
 *  heading, or off, is a dot. */
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
        ? `<div data-own-ship="${off ? "off" : "on"}" data-look="arrow" class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-(--depth-mark)" style="background:${fill}"></div>`
        : ownShipSvg(
            look,
            fill,
            size,
            `data-own-ship="${off ? "off" : "on"}" data-look="${look}" data-moving="${beam}" class="absolute left-0 top-0 drop-shadow-md drop-shadow-black/40" style="transform:rotate(${Number(headingDeg ?? 0)}deg)"`,
            beam,
          ),
  };
}

/** Traffic's colours: within 1,000 ft of own ship's height amber, the
 *  rest the ADS-B displays' cyan. */
export const TRAFFIC_COLOURS = { near: CHART.trafficNear, far: CHART.trafficFar } as const;
