import { test, expect } from "@playwright/test";
import { closeCard, drawn, grabberTo, settle, slow } from "./helpers";
import { sky } from "./trackingSky";
// The parked features it exercises, on (Settings' Extras, src/lib/extras).

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an airplane's past flights are listed on its card, and one is drawn on the map, replayed and logged", async ({ page }) => {
  // N654FL's morning as FlightAware has it: LWM to LCI, then LCI to LWM.
  const off = Date.now() / 1000 - 6 * 3600;
  const lci = { ident: "LCI", name: "Laconia Municipal Airport", city: "Laconia", region: "US-NH" };
  const lwm = { ident: "LWM", name: "Lawrence Municipal Airport", city: "Lawrence", region: "US-MA" };
  const points = Array.from({ length: 80 }, (_, i) => ({
    t: off + i * 60,
    lat: 43.57 - i * 0.0107,
    lon: -71.42 + i * 0.0038,
    alt_ft: 800 + Math.min(i, 79 - i) * 120,
    gs_kt: 100,
    track_deg: 165,
    vrate_fpm: i < 40 ? 500 : -500,
  }));
  await sky(page);
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a0b7d8\/history$/.test(url.pathname),
    (route) =>
      route.fulfill({
        json: {
          hex: "a0b7d8",
          registration: "N654FL",
          type: "P28A",
          flights: [
            { id: Math.floor(off), origin: lci, destination: lwm, off, on: off + 79 * 60, landed: true, in_air: false, max_alt_ft: 5520 },
            {
              id: Math.floor(off) - 7200,
              origin: lwm,
              destination: lci,
              off: off - 7200,
              on: off - 4400,
              landed: true,
              in_air: false,
              max_alt_ft: 4100,
            },
          ],
        },
      }),
  );
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a0b7d8\/history\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ json: { id: Math.floor(off), points } }),
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await grabberTo(page, "full"); // from the pill's size, as every card opens
  await expect(card.getByTestId("airplane-facts")).toBeVisible(); // over the pictures (2026-11-26)
  const rows = card.getByTestId("past-flight");
  await expect(rows).toHaveCount(2, { timeout: slow(15_000) });
  // FlightAware's row: how it ended and how long, then each end's field, its town and when.
  await expect(rows.first()).toContainText("Landed · 1h 19m");
  await expect(rows.first()).toContainText(/LCI\s*Laconia, NH/);
  await expect(rows.first()).toContainText(/LWM\s*Lawrence, MA/);
  await rows.first().click();
  // Its own card over the airplane's, at the pilot's ask: the replay, its
  // figures and its track log; drawn on the map in its heights' colours.
  await expect(page).toHaveURL(/[?&]past=\d+/);
  const flight = page.getByTestId("past-flight-card");
  await expect(flight.getByTestId("past-flight-name")).toHaveText("LCI → LWM");
  await expect(flight.getByTestId("past-flight-off")).toContainText("LCI");
  await expect(flight.getByTestId("past-flight-on")).toContainText("LWM");
  await expect(flight.getByTestId("past-flight-flown")).toContainText(/\d+ nm/);
  // Drawn as MapLibre's own line layer (TracksGl's PastFlightGl, read
  // through its probe), not the SVG path it was before the map was MapLibre.
  await expect.poll(async () => (await drawn(page, "past-flight")).length, { timeout: slow(10_000) }).toBeGreaterThan(0);
  // All the way up, the controls and the whole graph, its time axis too,
  // in sight: the axis was cut off on the owner's phone.
  await grabberTo(page, "full");
  await expect.poll(async () => (await flight.getByTestId("replay-chart-box").boundingBox())!.height).toBeGreaterThanOrEqual(72);
  await expect(flight.getByTestId("replay-chart-box")).toBeInViewport({ ratio: 1 });
  // The graph drawn to its box, axis and all.
  await expect
    .poll(async () => (await flight.getByTestId("replay-chart-box").locator("svg.recharts-surface").boundingBox())?.height)
    .toBeGreaterThanOrEqual(72);
  await expect(flight.getByTestId("track-log").locator("tbody tr")).toHaveCount(60);
  await flight.getByTestId("track-log-all").click();
  await expect(flight.getByTestId("track-log").locator("tbody tr")).toHaveCount(80);
  // Played at 200 times: where the airplane is, said under the controls.
  await flight.getByTestId("replay-speed").click();
  await page.getByTestId("replay-speed-200").click();
  await flight.getByTestId("replay-play").click();
  await expect(flight.getByTestId("replay-now")).toContainText(/ft · 100 kt · S/);
  // The cards are a stack over the sheet now, as Apple Maps' are (7e8aa7b29):
  // the search and the pager's bars are under it until its close, so the
  // past flight kept over the traffic while the search is up is
  // usePanelView.test's to prove, not a journey here (the owner's ask of
  // 5fa10bde7, "the cards should stay where they are when coming back").
  await flight.getByTestId("replay-stop").click();
  await expect(flight.getByTestId("replay-now")).toHaveCount(0);
  // Closed: back to the airplane's card, the path put away.
  await closeCard(page, "past-flight-close");
  await expect(page).not.toHaveURL(/[?&]past=/);
  await expect(card.getByTestId("past-flights-section")).toBeVisible();
  await expect.poll(async () => (await drawn(page, "past-flight")).length).toBe(0);
});

test("an airplane's last flights found are listed, the ones before them on asking, and from a day picked", async ({ page }) => {
  // The owner's ask: "make it last 10 flights you were able to find. But
  // also give an option to fetch more by date".
  const lci = { ident: "LCI", name: "Laconia Municipal Airport", city: "Laconia", region: "US-NH" };
  const lwm = { ident: "LWM", name: "Lawrence Municipal Airport", city: "Lawrence", region: "US-MA" };
  const flight = (off: number, from: typeof lci, to: typeof lci) => ({
    id: Math.floor(off),
    origin: from,
    destination: to,
    off,
    on: off + 3600,
    landed: true,
    in_air: false,
    max_alt_ft: 4500,
  });
  const now = Date.now() / 1000;
  const asked: URLSearchParams[] = [];
  await sky(page);
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a0b7d8\/history$/.test(url.pathname),
    (route) => {
      const query = new URL(route.request().url()).searchParams;
      asked.push(query);
      const base = { hex: "a0b7d8", registration: "N14511", type: "A21N" };
      if (query.get("before")) {
        return route.fulfill({ json: { ...base, flights: [flight(now - 20 * 86400, lci, lwm)], next_until: null } });
      }
      if (query.get("until")) {
        return route.fulfill({ json: { ...base, flights: [flight(now - 30 * 86400, lwm, lci)], next_until: null } });
      }
      return route.fulfill({
        json: { ...base, flights: [flight(now - 86400, lci, lwm), flight(now - 2 * 86400, lwm, lci)], next_until: "2026-10-01" },
      });
    },
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await grabberTo(page, "full"); // from the pill's size, as every card opens
  const rows = card.getByTestId("past-flight");
  await expect(rows).toHaveCount(2, { timeout: slow(15_000) });
  // The ones before, from where the list ends: before its last takeoff.
  await card.getByTestId("past-flights-more").click();
  await expect(rows).toHaveCount(3);
  expect(asked.at(-1)?.get("until")).toBe("2026-10-01");
  expect(Number(asked.at(-1)?.get("before"))).toBe(Math.floor(now - 2 * 86400));
  // The archive's end: no more to ask for.
  await expect(card.getByTestId("past-flights-more")).toHaveCount(0);
  // From a day picked, on the stock calendar: the first of this month,
  // in its grid and in the archive's six weeks.
  await card.getByTestId("past-flights-date").click();
  const picker = page.getByTestId("past-flights-picker");
  const iso = await page.evaluate(() => {
    const first = new Date();
    return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
  });
  await picker.locator(`[data-day="${iso}"]`).click();
  await expect(rows).toHaveCount(1);
  expect(asked.at(-1)?.get("until")).toBe(iso);
  await expect(card).toContainText("On and before");
  await expect(card.getByTestId("past-flights-date")).not.toContainText("Pick a day");
  // Back to the latest: the list as it was, the earlier ones still with it.
  // Once the picker has gone: tapped again while it was going, a desktop's
  // popover took the tap that reopened it for one outside and shut again,
  // in CI's run (Latest never showed).
  await expect(picker).toHaveCount(0);
  await card.getByTestId("past-flights-date").click();
  await page.getByTestId("past-flights-latest").click();
  await expect(rows).toHaveCount(3);
  await expect(card.getByTestId("past-flights-date")).toContainText("Pick a day");
});

test("an airplane quiet for a fortnight is looked for further back by itself, and said to be unheard where the archive ends", async ({
  page,
}) => {
  // The owner's N3429J: nothing in its first fortnight, "Look further
  // back" alone on the card.
  const asked: URLSearchParams[] = [];
  await sky(page);
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a0b7d8\/history$/.test(url.pathname),
    (route) => {
      const query = new URL(route.request().url()).searchParams;
      asked.push(query);
      const base = { hex: "a0b7d8", registration: "N3429J", type: "C150", flights: [] };
      const next = { "": "2026-09-28", "2026-09-28": "2026-09-14", "2026-09-14": null }[query.get("until") ?? ""] ?? null;
      return route.fulfill({ json: { ...base, next_until: next } });
    },
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await grabberTo(page, "full"); // from the pill's size, as every card opens
  await expect(card.getByTestId("past-flights-none")).toHaveText("No flights heard in the last six weeks", { timeout: slow(15_000) });
  expect(asked.map((q) => q.get("until"))).toEqual([null, "2026-09-28", "2026-09-14"]);
  await expect(card.getByTestId("past-flights-more")).toHaveCount(0);
});
