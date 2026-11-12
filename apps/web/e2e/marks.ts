import { expect, type Page } from "@playwright/test";
import { mapStill, slow } from "./helpers";

// The app's own marks on the map -- the route's fields and checkpoints,
// the weather's chips, the stops' pins -- drawn on the canvas by MapLibre
// (useGlSymbols), read through their probes, as the chart's are.

/** A mark of the app's own drawn on the map (useGlSymbols): its key, its
 *  words, its properties, and its point on the page. */
export interface DrawnMark {
  key?: string;
  text?: string;
  x: number;
  y: number;
  [field: string]: unknown;
}

/** Every mark drawn now from a source of the app's marks (useGlSymbols'
 *  probe, named for its source; a name a prefix of the sources' named
 *  `<name>-…`, a plate's tags each), on the page's own points: the
 *  route's fields and checkpoints are "route-marks", the weather's
 *  "wx-marks". A mark MapLibre's collision left out is not drawn. */
export async function drawnMarks(page: Page, source: string): Promise<DrawnMark[]> {
  return page.evaluate(
    (s) =>
      [...document.querySelectorAll<HTMLElement>("[data-gl-probe]")]
        .filter((p) => p.dataset.glProbe === s || p.dataset.glProbe!.startsWith(`${s}-`))
        .flatMap((p) => {
          const r = p.closest(".maplibregl-map")!.getBoundingClientRect();
          const rows = JSON.parse(p.getAttribute(`data-${p.dataset.glProbe}`) ?? "[]") as DrawnMark[];
          return rows.map((m) => ({ ...m, x: m.x + r.left, y: m.y + r.top }));
        }),
    source,
  );
}

/** The first mark of a source with these words (or this ident, for a
 *  mark whose words are on its picture: a procedure's fix), drawn now
 *  (null while it is not): for tapNear, and to poll until it is drawn. */
export function markWith(page: Page, source: string, words: string | RegExp) {
  const named = (m: DrawnMark) => String(m.text || m.ident || "");
  return async (): Promise<DrawnMark | null> =>
    (await drawnMarks(page, source)).find((m) => (typeof words === "string" ? named(m) === words : words.test(named(m)))) ?? null;
}

/** The sources of the app's own marks (useGlSymbols), which a tap on the
 *  chart under one would select instead. */
const APP_MARKS = [
  "route-marks",
  "leg-points",
  "class-b-fields",
  "wx-marks",
  "fuel-stops",
  "stop-fields",
  "procedure-fixes",
  "route-way-chips",
];

/** Every one of the app's own marks drawn now, on the page's points. */
export async function appMarks(page: Page): Promise<DrawnMark[]> {
  return (await Promise.all(APP_MARKS.map((s) => drawnMarks(page, s)))).flat();
}

/** A tap on the mark of a source with these words, once it is drawn. */
export async function tapMark(page: Page, source: string, words: string | RegExp) {
  await mapStill(page);
  await expect.poll(markWith(page, source, words), { timeout: slow(30000) }).not.toBeNull();
  const at = (await markWith(page, source, words)())!;
  await page.mouse.click(at.x, at.y);
}
