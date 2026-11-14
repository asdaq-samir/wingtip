import { test, expect, type Page } from "@playwright/test";
import { drawn, grabberTo, mapStill, settle, showTraffic as showTrafficCard, slow } from "./helpers";
import { sky } from "./cardEntries";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";

/**
 * The traffic about the map (TrafficGl's symbol layers, read through
 * their probes: traffic-marks, traffic-trends), from adsb.lol through the
 * planner, when the map's settings show it: stubbed here, adsb.lol's sky
 * not being the suite's. Two airplanes near Campbell Airport (C81).
 */

const TRAFFIC = {
  source: "adsb.lol",
  license: "ODbL 1.0",
  aircraft: [
    {
      hex: "a1",
      callsign: "N174HA",
      lat: 42.33,
      lon: -88.05,
      altitude_ft: 4500,
      pressure_altitude: false,
      track_deg: 320,
      speed_kt: 94,
      vertical_fpm: -800,
    },
    {
      hex: "a2",
      callsign: "UAL1023",
      lat: 42.3,
      lon: -88.1,
      altitude_ft: 9800,
      pressure_altitude: false,
      track_deg: 90,
      speed_kt: 220,
      vertical_fpm: 0,
    },
  ],
};

async function showTraffic(page: Page, on: boolean) {
  await page.addInitScript((show) => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: show } }));
  }, on);
  const asks: URL[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => {
      asks.push(new URL(route.request().url()));
      return route.fulfill({ json: TRAFFIC });
    },
  );
  return asks;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// The journey's one @smoke (the credit riding the sheet's top went with the
// map's credits row, the owner 2026-11-11).
test(
  "shown in the map's settings, the airplanes about are drawn on their tracks with their heights",
  { tag: "@smoke" },
  async ({ page }) => {
    const asks = await showTraffic(page, true);
    await page.goto("/app/plan?place=C81");
    await settle(page);
    await expect.poll(async () => (await drawn(page, "traffic-marks")).length, { timeout: slow(15_000) }).toBe(2);
    // With no own ship, each one's own height, a descent's arrow with it:
    // once the map has come in to the field (HEIGHT_ZOOM). The account has
    // no home, so the page opens on the whole country and flies in to C81,
    // and the airplanes are drawn on the way, their heights not yet.
    await expect
      .poll(async () => (await drawn(page, "traffic-marks")).map((m) => String(m.label)).sort())
      .toEqual([expect.stringMatching(/^4,500↓/), expect.stringMatching(/^9,800/)]);
    const marks = await drawn(page, "traffic-marks");
    // Turned by MapLibre against the map (icon-rotation-alignment "map"),
    // the flat chart's bearing 0, so its turn is the track.
    expect(marks.find((m) => m.hex === "a1")?.track).toBe(320);
    // Credited in Status and About, not on the map (the owner, 2026-11-11).
    await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCount(0);
    expect(asks.length).toBeGreaterThan(0);
    // Asked again while it shows.
    const first = asks.length;
    await expect.poll(() => asks.length, { timeout: slow(12_000) }).toBeGreaterThan(first);
  },
);

test("between reports each airplane is carried on along its track, as ForeFlight's and FlightAware's are", async ({ page }) => {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: true } }));
  });
  // One report, the planner's held answer growing older as adsb.lol is
  // not asked again (wingtip.traffic): UAL1023 east at 450 kt.
  const reported = Date.now();
  const jet = { ...TRAFFIC.aircraft[1], speed_kt: 450 };
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { ...TRAFFIC, aircraft: [jet], age_s: (Date.now() - reported) / 1000 } }),
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  const mark = async () => (await drawn(page, "traffic-marks")) as { x: number; y: number }[];
  await expect.poll(async () => (await mark()).length, { timeout: slow(15_000) }).toBe(1);
  // Its line out to where it will be in a minute.
  await expect.poll(async () => (await drawn(page, "traffic-trends")).length).toBe(1);
  // The map at rest over C81 first: the page opens on the whole country
  // (the account has no home) and flies in, which moved the mark too.
  await mapStill(page);
  const first = (await mark())[0]!;
  // East, some 0.4 nm in three seconds: points to the right at this zoom
  // (about a point a second), and no jump back as the same report comes
  // again. Polled, as the probe is written only when the map is idle,
  // which tiles still coming in can hold off for a while after it rests.
  await expect.poll(async () => (await mark())[0]!.x - first.x, { timeout: slow(10_000) }).toBeGreaterThan(2);
  const later = (await mark())[0]!;
  expect(Math.abs(later.y - first.y)).toBeLessThan(2);
});

test("off, as it is unless shown, nothing is asked and nothing drawn", async ({ page }) => {
  const asks = await showTraffic(page, false);
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await page.waitForTimeout(2000);
  expect(asks).toHaveLength(0);
  expect(await drawn(page, "traffic-marks")).toHaveLength(0);
  // No small print on the map at all (MapCredits).
  await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCount(0);
});

test("the traffic is asked about wherever the map is panned, own ship or not, and further out for a map zoomed out", async ({
  page,
  context,
}) => {
  // Own ship at Campbell (C81): the traffic was asked about it whatever
  // the map showed, so a map panned to Madison showed none there.
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42.32, longitude: -88.07 });
  const asks = await showTraffic(page, true);
  await page.goto("/app/plan?place=KMSN");
  await settle(page);
  await expect.poll(() => asks.length, { timeout: slow(15_000) }).toBeGreaterThan(0);
  const last = () => asks[asks.length - 1]!.searchParams;
  // About Madison, the map's middle (a little off it, clear of the card),
  // not Campbell, 65 nm away to the south-east.
  await expect
    .poll(
      () => {
        const lat = Number(last().get("lat")),
          lon = Number(last().get("lon"));
        const from = (a: number, b: number) => Math.hypot(lat - a, (lon - b) * 0.73);
        return from(43.14, -89.34) < from(42.32, -88.07);
      },
      { timeout: slow(15_000) },
    )
    .toBe(true);
  // Zoomed out to a state: asked further than the near regions' 60 nm --
  // the card down to its pill first, the map clear over it.
  await grabberTo(page, "peek");
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 4);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
  }
  await expect.poll(() => Number(last().get("radius")), { timeout: slow(15_000) }).toBeGreaterThan(60);
});

test("an answer missed while the map is panned is not said; traffic is said unavailable only after half a minute without one", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: true } }));
  });
  let down = false;
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) =>
      down
        ? route.fulfill({ status: 503, json: { detail: "Traffic isn't available right now: adsb.lol has not answered for a minute." } })
        : route.fulfill({ json: TRAFFIC }),
  );
  await page.clock.install();
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect.poll(async () => (await drawn(page, "traffic-marks")).length, { timeout: slow(15_000) }).toBe(2);
  down = true;
  await page.clock.runFor(10_000);
  await expect(page.getByText("Traffic isn't available right now.")).toHaveCount(0);
  await page.clock.runFor(35_000);
  await expect(page.getByText("Traffic isn't available right now.")).toBeVisible({ timeout: slow(10_000) });
});

test("an airplane's card opens at its size: where it left and its record come into the lines held for them", async ({ page }) => {
  await sky(page);
  await installFrameRecorder(page);
  await page.goto("/app/plan");
  await settle(page);
  await showTrafficCard(page);
  await page.getByTestId("aircraft-search").fill("UAL2088");
  const row = page.getByTestId("aircraft-card").getByTestId("aircraft-found").filter({ hasText: "UAL2088" }).first();
  // Its ends' line and its record's rows from the first frame: they came in
  // as its record answered, 48 px over its figures and the card under them,
  // a layout shift of 0.114 (the flicker audit's FL-10).
  await expectDrawnOnce(
    page,
    async () => {
      await row.tap();
      await expect(page.getByTestId("flight-card")).toBeVisible();
    },
    { card: "flight-card", maxMoves: Number.POSITIVE_INFINITY, shiftBudget: 0.01, settleMs: 2500 },
  );
});

test("an airplane tapped on the map is tracked with at most one move, never a move cut short or undone", async ({
  page,
}) => {
  // The flicker audit's FL-7 (2026-11-14): the tracking's follow jumped the
  // map to the airplane at every frame, which stopped the flight to it
  // 124 ms in, seven camera calls in a second and a half. Now an airplane
  // tapped on the chart, in sight already, is not flown to, and the follow
  // (the camera's owner) keeps it where it is on the screen, moving the map
  // only as the airplane moves on it. The map opened over Lake Michigan, the
  // pilot's last position, with no card up; N174HA alone, 9 nm north of
  // it, clear of any field's mark.
  await installFrameRecorder(page);
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: true } }));
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: false, follow: true, lastFix: { lat: 42.6, lon: -87.3 } }, version: 0 }),
    );
  });
  const reported = Date.now();
  const plane = { ...TRAFFIC.aircraft[0], lat: 42.75, lon: -87.3 };
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { ...TRAFFIC, aircraft: [plane], age_s: Math.min(5, (Date.now() - reported) / 1000) } }),
  );
  // Its flight's history, route and photo not the suite's to ask for.
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/") || url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ status: 404, json: { detail: "Not known." } }),
  );
  await page.goto("/app/plan");
  await settle(page);
  await expect.poll(async () => (await drawn(page, "traffic-marks")).length, { timeout: slow(15_000) }).toBe(1);
  await mapStill(page);
  const box = (await page.getByTestId("gl-map").first().boundingBox())!;
  const mark = (await drawn(page, "traffic-marks"))[0]!;
  await expectDrawnOnce(
    page,
    async () => {
      await page.mouse.click(box.x + Number(mark.x), box.y + Number(mark.y));
      await expect(page.getByTestId("flight-card")).toBeVisible();
    },
    { card: "flight-card", maxMoves: 1, settleMs: 2500 },
  );
  // Tracked and followed all the while.
  await expect(page).toHaveURL(/[?&]flight=a1/);
  await expect.poll(async () => (await drawn(page, "traffic-marks"))[0]?.tracked).toBe(true);
});
