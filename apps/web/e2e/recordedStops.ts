import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/* C81 to KDLH through KMSN as the planner answered it, recorded
 * (stops.spec): its two hops' chart has never been read on CI's runner. */

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** The stop's course, checkpoints and nav log answered from the recording;
 *  the route's chart is the live planner's, so the tiles still draw. */
export async function recordedStops(page: Page) {
  const course = JSON.parse(fixture("stops-course.json"));
  await page.route(
    (url) => url.pathname.endsWith("/course") && url.searchParams.get("stops") === "KMSN",
    async (route) => {
      const live = new URL(route.request().url());
      live.searchParams.delete("stops");
      const chart = await (await route.fetch({ url: live.toString() })).json();
      const { departure, destination, stops, distance_nm, bearing_deg, course_line } = course;
      await route.fulfill({ json: { ...chart, departure, destination, stops, distance_nm, bearing_deg, course_line } });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/checkpoints") && url.searchParams.get("stops") === "KMSN",
    (route) => route.fulfill({ contentType: "application/json", body: fixture("stops-checkpoints.json") }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/navlog") && url.searchParams.get("stops") === "KMSN",
    (route) => route.fulfill({ contentType: "application/x-ndjson", body: fixture("stops-navlog.ndjson") }),
  );
}
