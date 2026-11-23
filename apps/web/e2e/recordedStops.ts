import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/* C81 to KDLH through KMSN as the planner answered it, recorded
 * (stops.spec): its two hops' chart has never been read on CI's runner. */

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** A route's course, checkpoints and nav log answered from its recording
 *  (`name`-course.json, -checkpoints.json, -navlog.ndjson), for the asks
 *  `mine` picks out; the route's chart is the live planner's, so the tiles
 *  still draw. */
async function recorded(page: Page, name: string, mine: (url: URL) => boolean) {
  const course = JSON.parse(fixture(`${name}-course.json`));
  await page.route(
    (url) => url.pathname.endsWith("/course") && mine(url),
    async (route) => {
      const live = new URL(route.request().url());
      live.searchParams.delete("stops");
      const chart = await (await route.fetch({ url: live.toString() })).json();
      const { departure, destination, stops, distance_nm, bearing_deg, course_line } = course;
      await route.fulfill({ json: { ...chart, departure, destination, stops, distance_nm, bearing_deg, course_line } });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/checkpoints") && mine(url),
    (route) => route.fulfill({ contentType: "application/json", body: fixture(`${name}-checkpoints.json`) }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/navlog") && mine(url),
    (route) => route.fulfill({ contentType: "application/x-ndjson", body: fixture(`${name}-navlog.ndjson`) }),
  );
}

/** C81 to KDLH through KMSN, from its recording (stops.spec). */
export const recordedStops = (page: Page) => recorded(page, "stops", (url) => url.searchParams.get("stops") === "KMSN");

/**
 * C81 to KDLH direct in a C172 with its checkpoints, from its recording
 * (2026-11-23, the 10-29-2026 cycle): planned cold on CI's runner its
 * cruise altitudes took over a minute ("Planning Altitudes…" at
 * route-line.spec's minute, run 45127491141), and the suggested routes,
 * which wait for the plan (useRouteWays), never came in time.
 */
export const recordedDirect = (page: Page) =>
  recorded(
    page,
    "c81-kdlh",
    (url) => url.searchParams.get("dep") === "C81" && url.searchParams.get("dest") === "KDLH" && !url.searchParams.get("stops"),
  );
