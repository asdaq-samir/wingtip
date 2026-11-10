import type { Page } from "@playwright/test";

/** The course line's core, on screen: the box round every piece of it
 *  the map drew (RouteGl's route-line probe), in the page's points. A canvas has no path to measure, as Leaflet's SVG had. */
export const courseBox = (page: Page) =>
  page.evaluate(() => {
    const map = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-gl-probe="route-line"]')].flatMap((p) =>
      (JSON.parse(p.getAttribute("data-route-line") ?? "[]") as { box?: number[] }[]).flatMap((r) => (r.box ? [r.box] : [])),
    );
    if (!boxes.length) throw new Error("no course drawn");
    const [x0, y0, x1, y1] = [0, 1, 2, 3].map((i) => (i < 2 ? Math.min : Math.max)(...boxes.map((b) => b[i]!)));
    return { x: map.left + x0!, y: map.top + y0!, width: x1! - x0!, height: y1! - y0! };
  });
