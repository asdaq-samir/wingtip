import { test, expect, type Page } from "@playwright/test";
import { openMapSettings, settle, slow } from "./helpers";

/**
 * The model weather's flow layer (features/weather-flow, the owner's
 * 2026-11-11 ask: Windy's map, then Apple Weather's wind and precipitation
 * maps): off by default; turned on from the Map menu's Weather group; its
 * legend at the map's top left says the field, its unit and that it is a
 * model forecast, not an observation; its timeline says the hour in Zulu;
 * the legend's menu changes the field and its close turns the layer off.
 * The planner's timeline and its pictures stubbed (a clear pixel each),
 * so nothing here reaches NOMADS or the weather service.
 */

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
const FIELDS = ["cape", "ceiling", "cloud", "gust", "precip", "temp", "vis", "wind"];

/** The last hour, now and three forecast hours, as wingtip.weather_flow lists them. */
function timeline() {
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const frames = [-1, 0, 2, 4, 6].map((h) => {
    const at = new Date(hour + h * 3_600_000);
    const iso = `${at.toISOString().slice(0, 19)}Z`;
    return {
      id: iso.slice(0, 13).replace(/[-T]/g, ""),
      valid: iso,
      model: "HRRR and GFS",
      gfs_run: "2026-11-11T18:00:00Z",
      gfs_forecast_hour: 8 + h,
      hrrr_run: null,
      hrrr_forecast_hour: null,
      past: h <= 0,
      fields: FIELDS,
      radar_tiles: null,
    };
  });
  const scalar = (unit: string, unscale: number[]) => ({ unit, unscale, vector: false });
  return {
    frames,
    bounds: [-180.125, 4.875, -49.875, 75.125],
    fields: {
      wind: { unit: "kt", unscale: [-100, 100], vector: true },
      gust: scalar("kt", [0, 100]),
      precip: scalar("dBZ", [0, 75]),
      cloud: scalar("%", [0, 100]),
      ceiling: scalar("ft", [0, 12750]),
      cape: scalar("J/kg", [0, 5100]),
      temp: scalar("°C", [-50, 50]),
      vis: scalar("SM", [0, 10]),
    },
    fetched_at: Date.now() / 1000,
    credit: "Model forecast, not an observation: NOAA HRRR and GFS. Not for navigation.",
  };
}

async function stubFlow(page: Page) {
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname.includes("/weather/flow"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      asked.push(path);
      return path.endsWith(".png") ? route.fulfill({ body: PIXEL, contentType: "image/png" }) : route.fulfill({ json: timeline() });
    },
  );
  return asked;
}

test("model weather is off by default, turned on from the Map menu, and its legend and timeline say what it is", async ({ page }) => {
  const asked = await stubFlow(page);
  await page.goto("/app/plan");
  await settle(page);
  // Off until asked for: no legend, nothing asked of the planner.
  await expect(page.getByTestId("weather-flow-legend")).toHaveCount(0);
  expect(asked).toHaveLength(0);

  await openMapSettings(page);
  await page.getByTestId("weather-flow").click();
  await page.getByTestId("weather-flow-wind").click();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-settings")).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: slow(10000) });

  // Its own chunk loaded and drawing: the legend, the timeline, deck.gl's
  // layers inside the map's own canvas, the wind's picture asked for.
  const legend = page.getByTestId("weather-flow-legend");
  await expect(legend).toBeVisible({ timeout: slow(15000) });
  await expect(legend).toContainText("Wind (kt)");
  await expect(page.getByTestId("weather-flow-source")).toContainText("Model forecast, not an observation");
  await expect(page.getByTestId("weather-flow-time")).toContainText(/\d{4}Z/);
  await expect(page.getByTestId("weather-flow-bar")).toContainText("Now");
  await expect(page.locator("[data-testid=gl-map] canvas")).toHaveCount(1);
  await expect.poll(() => asked.some((p) => p.endsWith("/wind.png"))).toBe(true);

  // The legend's menu changes the field; precipitation is said in words.
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-precip").click();
  await expect(legend).toContainText("Moderate");
  await expect.poll(() => asked.some((p) => p.endsWith("/precip.png"))).toBe(true);

  // The ceiling in AIM 7-1-7's bands, CAPE in the NWS's categories.
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-ceiling").click();
  await expect(legend).toContainText("MVFR 1,000");
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-cape").click();
  await expect(legend).toContainText("Strong 2,500");
  await expect.poll(() => asked.some((p) => p.endsWith("/cape.png"))).toBe(true);
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-precip").click();

  // A forecast hour scrubbed to says so.
  await page.getByRole("slider", { name: "Precipitation hour" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("weather-flow-bar")).toContainText("Forecast +6 h");

  // Close turns it off.
  await page.getByTestId("weather-flow-close").click();
  await expect(legend).toHaveCount(0);
  await expect(page.getByTestId("weather-flow-bar")).toHaveCount(0);
});

test("under Reduce Motion the timeline does not play by itself", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubFlow(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "wingtip.weatherLayers",
      JSON.stringify({ state: { loop: "off", loopSpeed: "normal", areas: false, pireps: false, winds: "off", flow: "wind" }, version: 0 }),
    ),
  );
  await page.goto("/app/plan");
  await settle(page);
  await expect(page.getByTestId("weather-flow-legend")).toBeVisible({ timeout: slow(15000) });
  await expect(page.getByTestId("weather-flow-play")).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("weather-flow-play")).toHaveAttribute("aria-pressed", "false");
});
