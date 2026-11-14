import { test, expect } from "@playwright/test";
import { chartZoom, grabberTo, openMapSettings, settle, slow } from "./helpers";
import { markWith } from "./marks";

/**
 * The chart layers the map asks for: the terminal area chart over the
 * sectional always, at its own levels, and the IFR low enroute chart as the
 * base. Switched with a route on screen, on the training page: the
 * planner's map is the same (MapShell), and its settings are on the
 * search bar, which a route takes the place of (classb.spec.ts sets
 * them there before one is loaded).
 *
 * A chart's tiles are told apart by its kind in their path, wherever they
 * come from: the planner's /api/planner/chart-tile/<kind>/... locally,
 * the CDN's /tiles/<cycle>/<kind>/... once a cycle is published (the
 * production rehearsal, infra/rehearsal).
 */

for (const path of ["/app/dev"] as const) {
  test(`${path}: the TAC is always drawn over the sectional, with no switch`, async ({ page }) => {
    // The owner, 2026-11-14: "TAC switch is not needed, just have it on by
    // default". Zoomed in over C81 (inside the Chicago TAC) past the
    // sectional's own detail, the map asks for TAC tiles and at least one
    // of them actually renders -- the planner draws it from the FAA's own
    // TAC raster, which on a cold tile cache is a quarter of a second per
    // tile for a screenful of them; hence the longer budget. A kept "off"
    // from the switch's time is not read.
    test.setTimeout(slow(90000));
    await page.addInitScript(() => {
      const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? "{}") as { state?: object; version?: number };
      localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, tac: false } }));
    });
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    // The charts the map draws (ChartGl's data-chart-kinds), and the TAC's
    // tiles that came back drawn.
    const kinds = () => page.getByTestId("gl-map").getAttribute("data-chart-kinds");
    let tacDrawn = 0;
    page.on("response", (r) => {
      if (/\/tac\/\d+\//.test(r.url()) && r.ok()) tacDrawn += 1;
    });
    await expect.poll(kinds, { timeout: slow(15000) }).toBe("sec tac");

    // Wheel-zoom in over the departure marker to the TAC's own levels
    // (its tiles from z10, ChartGl's data-chart-zoom 11 and on), where
    // the sectional is at its last detail; the map zooms about the
    // cursor, so C81 stays under it. Not further: past the TAC's last
    // level (13) the chart fades into the imagery (closeZoom) and no TAC
    // tile is asked for. Eight fixed wheel steps from the
    // route's whole view (zoom 6) came only to 7, short of the TAC.
    await expect.poll(markWith(page, "route-marks", "C81")).not.toBeNull();
    const marker = (await markWith(page, "route-marks", "C81")())!;
    await page.mouse.move(marker.x, marker.y);
    await expect(async () => {
      await page.mouse.wheel(0, -120);
      expect(await chartZoom(page)).toBeGreaterThanOrEqual(11);
    }).toPass({ timeout: slow(30000) });
    await expect.poll(() => tacDrawn, { timeout: slow(45000) }).toBeGreaterThan(0);

    // No switch for it in the Map card.
    await openMapSettings(page);
    await expect(page.getByTestId("tac-toggle")).toHaveCount(0);
    await expect(page.getByTestId("map-settings").getByText("Terminal Area Charts")).toHaveCount(0);
  });

  test(`${path}: the base chart can be the IFR low enroute chart, and back`, async ({ page }) => {
    // The sectional by default; picking "IFR low" in the info popover
    // swaps the base layer for the IFR enroute chart's own tiles, the IFR
    // area chart over it; picking "Sectional" brings the sectional back.
    test.setTimeout(slow(90000));
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    const kinds = () => page.getByTestId("gl-map").getAttribute("data-chart-kinds");
    let ifrDrawn = 0;
    page.on("response", (r) => {
      if (/\/ifr_low\/\d+\//.test(r.url()) && r.ok()) ifrDrawn += 1;
    });
    await expect.poll(kinds, { timeout: slow(15000) }).toBe("sec");

    await openMapSettings(page);
    await grabberTo(page, "full");
    await page.getByTestId("base-chart-select").getByRole("button", { name: "IFR low" }).click();
    await expect.poll(kinds, { timeout: slow(10000) }).toBe("ifr_low");
    await expect.poll(() => ifrDrawn, { timeout: slow(45000) }).toBeGreaterThan(0);

    await page.getByTestId("base-chart-select").getByRole("button", { name: "Sectional" }).click();
    await expect.poll(kinds, { timeout: slow(10000) }).toBe("sec");
  });

  test(`${path}: the chart can be None: no chart tile, the plain ground, the route still drawn`, async ({ page }) => {
    // The owner, 2026-11-14: "chart should also have none option". None
    // asks for no chart tile and draws the plain ground (BaseGl's
    // PlainGround) under the vector layers, no terminal sheet with it;
    // kept over a reload.
    test.setTimeout(slow(90000));
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    const map = page.getByTestId("gl-map");
    await expect.poll(() => map.getAttribute("data-chart-kinds"), { timeout: slow(15000) }).toBe("sec");

    await openMapSettings(page);
    await grabberTo(page, "full");
    await page.getByTestId("base-chart-select").getByRole("button", { name: "None" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => map.getAttribute("data-chart-kinds")).toBe("");
    await expect(map).toHaveAttribute("data-ground", "plain");

    let chartAsked = 0;
    page.on("request", (r) => {
      if (/chart-tile\/|\/(?:sec|ifr_low|ifr_high|tac)\/\d+\//.test(r.url())) chartAsked += 1;
    });
    await page.reload();
    await settle(page);
    await expect(map).toHaveAttribute("data-ground", "plain");
    await expect.poll(markWith(page, "route-marks", "C81")).not.toBeNull();
    expect(chartAsked).toBe(0);
  });
}
