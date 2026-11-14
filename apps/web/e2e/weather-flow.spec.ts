import { test, expect, type Page } from "@playwright/test";
import { grabberTo, openMapSettings, settle, slow, tapTheChart } from "./helpers";

/**
 * The model weather's flow layer (features/weather-flow, the owner's
 * 2026-11-11 ask: Windy's map, then Apple Weather's wind and precipitation
 * maps; 2026-11-12, AWC's Winds map): off by default; turned on from the
 * Map menu's Weather group; its legend at the map's top left says the
 * field, its unit and whose it is ("AWC winds, 12Z"), and a level menu
 * picks the wind's level, asking that level's picture; its timeline says
 * the hour in Zulu and whether it is a forecast; the G-AIRMETs are asked
 * for the hour shown; the legend's menu changes the field and its close
 * turns the layer off. The planner's timeline, its pictures and its
 * weather map stubbed (a clear pixel each), so nothing here reaches AWC,
 * NOMADS or the weather service.
 */

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
const FIELDS = [
  "cape",
  "ceiling",
  "cloud",
  "gust",
  "precip",
  "temp",
  "vis",
  "wind",
  "wind-060",
  "temp-060",
  "icing-060",
  "turb-max",
  "frzlvl",
  "tops",
];
/** Each picture's source as wingtip.weather_flow says it: AWC's for the
 *  wind, the icing and the turbulence; NOAA's for the rest. */
const source = (file: string) =>
  /^(wind|gust|cloud|tops|icing|turb)/.test(file)
    ? {
        label: file.startsWith("icing") ? "AWC icing" : file.startsWith("turb") ? "AWC turbulence" : "AWC winds",
        issued: "2026-11-12T12:00:00Z",
        stale: false,
        fallback: false,
      }
    : { label: "NOAA GFS", issued: "2026-11-11T18:00:00Z", stale: false, fallback: false };

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
      versions: Object.fromEntries(FIELDS.map((f) => [f, "c2026111212f02"])),
      sources: Object.fromEntries(FIELDS.map((f) => [f, source(f)])),
      radar_tiles: null,
    };
  });
  const scalar = (unit: string, unscale: number[]) => ({ unit, unscale, vector: false });
  return {
    frames,
    bounds: [-180.125, 4.875, -49.875, 75.125],
    world_bounds: [-180.5, -90.5, 179.5, 90.5],
    levels: { wind: ["sfc", "060", "max"], icing: ["060"], turbulence: ["max"] },
    fields: {
      wind: { unit: "kt", unscale: [-100, 100], vector: true },
      gust: scalar("kt", [0, 100]),
      precip: scalar("dBZ", [0, 75]),
      cloud: scalar("%", [0, 100]),
      ceiling: scalar("ft", [0, 12750]),
      cape: scalar("J/kg", [0, 5100]),
      temp: scalar("°C", [-75, 52.5]),
      vis: scalar("SM", [0, 10]),
      icing: scalar("category", [0, 5.1]),
      turb: scalar("EDR", [0, 1.02]),
      frzlvl: scalar("ft", [0, 25500]),
      tops: scalar("ft", [0, 51000]),
    },
    fetched_at: Date.now() / 1000,
    credit: "Aviation Weather Center (aviationweather.gov): GFA winds and clouds, IFI icing, GTG turbulence.",
  };
}

async function stubFlow(page: Page) {
  const asked: string[] = [];
  // The G-AIRMETs for the hour shown: the planner's weather map, one
  // strong-surface-winds snapshot.
  await page.route(
    (url) => url.pathname.includes("/weather/map"),
    (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({
        json: {
          at: Date.now() / 1000,
          advisories: [
            {
              id: "gairmet-0",
              kind: "gairmet",
              hazard: "Strong surface winds",
              severity: null,
              low_ft: null,
              high_ft: null,
              from_freezing_level: false,
              valid_from: Date.now() / 1000,
              valid_to: null,
              raw: null,
              coords: [
                [34, -102],
                [34, -98],
                [31, -98],
                [31, -102],
              ],
            },
          ],
          pireps: [],
          winds: null,
          radar_valid: null,
        },
      });
    },
  );
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
  // The Map card opens half way, as every card does (e7bb15ec8): pulled all the way up, its rows in reach.
  await grabberTo(page, "full");
  // A submenu of the Weather tile's ••• menu (the four layers, 2026-11-14).
  await page.getByTestId("weather-more").click();
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
  // Whose it is, the Aviation Weather Center's, and its cycle's hour: no
  // "not an observation" caveat (the owner, 2026-11-12). The timeline has
  // the world's wind too (world_bounds), drawn past AWC's box from the GFS,
  // and the line says so (flowSource's sourceLine, 8d941d4e0).
  await expect(page.getByTestId("weather-flow-source")).toHaveText("AWC winds, 12Z; NOAA GFS beyond");
  await expect(legend).not.toContainText("not an observation");
  await expect(page.getByTestId("weather-flow-time")).toContainText(/\d{4}Z/);
  await expect(page.getByTestId("weather-flow-bar")).toContainText("Now");
  await expect(page.getByTestId("weather-flow-bar")).toContainText("Wind Speed");
  await expect(page.locator("[data-testid=gl-map] canvas")).toHaveCount(1);
  await expect.poll(() => asked.some((p) => p.endsWith("/wind.png"))).toBe(true);
  // The G-AIRMETs asked for the hour shown.
  await expect.poll(() => asked.some((p) => p.includes("at="))).toBe(true);

  // The level menu: AWC's levels, a menu, not a slider; FL060's picture asked.
  await page.getByTestId("weather-flow-level").click();
  await page.getByTestId("weather-flow-level-060").click();
  await expect(page.getByTestId("weather-flow-level")).toContainText("FL060");
  await expect.poll(() => asked.some((p) => p.endsWith("/wind-060.png"))).toBe(true);
  await page.getByTestId("weather-flow-level").click();
  await page.getByTestId("weather-flow-level-sfc").click();

  // AWC's icing and turbulence, in its words.
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-icing").click();
  await expect(legend).toContainText("Moderate");
  await expect(page.getByTestId("weather-flow-source")).toHaveText("AWC icing, 12Z");
  await expect.poll(() => asked.some((p) => p.endsWith("/icing-060.png"))).toBe(true);
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-turb").click();
  await expect(legend).toContainText("Severe");
  await expect.poll(() => asked.some((p) => p.endsWith("/turb-max.png"))).toBe(true);

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

  // A forecast hour scrubbed to says so; its title is "Forecast", and the
  // 1h span runs over the hour past alone, ending at now.
  const bar = page.getByTestId("weather-flow-bar");
  await expect(bar).toContainText("Forecast");
  await page.getByRole("slider", { name: "Precipitation hour" }).focus();
  await page.keyboard.press("End");
  await expect(bar).toContainText("Forecast +6 h");
  await page.getByTestId("weather-flow-span").getByRole("button", { name: "1h" }).click();
  // The stock Slider's thumb is a range input: its bounds are its own
  // min and max, read by a screen reader as the input's.
  await expect(page.getByRole("slider", { name: "Precipitation hour" })).toHaveAttribute("max", "1");
  // An hour past is still the model's forecast (the radar's mosaic, held
  // by the stub, would say "Observed"), not a forecast ahead.
  await expect(page.getByTestId("weather-flow-time")).not.toContainText("Forecast +");
  await page.getByTestId("weather-flow-span").getByRole("button", { name: "12h" }).click();

  // A tap on an hour's label goes to it.
  await page.getByTestId("weather-flow-now").click();
  await expect(page.getByTestId("weather-flow-time")).not.toContainText("Forecast +");

  // The temperature carries no bubble's unit: its pill is the figure alone,
  // and only where the pilot taps (FlowBubble: at the map's middle it
  // stood on own ship's pill).
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-temp").click();
  await expect(legend).toContainText("-15");
  await expect(page.getByTestId("weather-flow-bubble")).toHaveCount(0);
  await tapTheChart(page);
  await expect(page.getByTestId("weather-flow-bubble").first()).toBeVisible();
  await expect(page.getByTestId("weather-flow-bubble").first()).not.toContainText("°C");
  await page.getByTestId("weather-flow-legend-field").click();
  await page.getByTestId("weather-flow-legend-field-precip").click();

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
