import { test, expect, type Page } from "@playwright/test";
import { openMapSettings, pickControl, settle, slow } from "./helpers";

/**
 * Night: in the dark theme the sheets are the cockpit palette's navy and
 * the FAA chart's tiles alone are dimmed, to half by default, so the white
 * paper chart does not take the pilot's night vision -- not the marks, the
 * course or the sheets over it. The Map card's Dimmer, kept for the dark
 * apart from the light, sets how far; at 0 the chart is as printed under
 * the dark page, which was Appearance's Dark + Bright until 2026-11-18. A
 * browser that prefers dark is in the dark theme on System.
 */

test.use({ colorScheme: "dark" });

/** How the map paints the chart's tiles (ChartGl's data-chart-look): dimmed,
 *  as printed, or brightened in sunlight -- the map's own raster paint,
 *  nothing over the chart touched. */
const lookOf = (page: Page) => page.getByTestId("gl-map").getAttribute("data-chart-look");

test("in the dark theme the page is the night's navy and only the chart's tiles are dimmed, until the Dimmer is 0", async ({ page }) => {
  test.setTimeout(slow(60000));
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  // The tokens: the palette's ground and surface.
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { background: s.getPropertyValue("--background").trim(), card: s.getPropertyValue("--card").trim() };
  });
  expect(tokens).toEqual({ background: "#0b1422", card: "#17283a" });
  expect(await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(11, 20, 34)");

  // The chart's tiles dimmed, by the map's paint.
  await expect.poll(() => lookOf(page), { timeout: slow(15000) }).toBe("dimmed");

  // The Dimmer at 0: the chart as printed, and kept so across a reload.
  // The browser's dark on System is read as System, not Dark.
  await openMapSettings(page);
  const look = page.getByTestId("map-look");
  await expect(look.getByTestId("theme-select")).toHaveAttribute("aria-label", "Appearance: System");
  const dimmer = look.getByRole("slider", { name: "Dimmer" });
  await expect(dimmer).toHaveAttribute("aria-valuetext", "50%");
  await dimmer.focus();
  await page.keyboard.press("Home");
  await expect(dimmer).toHaveAttribute("aria-valuetext", "0%");
  await expect.poll(() => lookOf(page)).toBe("normal");
  await page.reload();
  await settle(page);
  await expect.poll(() => lookOf(page)).toBe("normal");

  // Dark by hand keeps the dark's Dimmer; the light theme has its own, undimmed.
  await openMapSettings(page);
  await pickControl(page, "theme-select", "theme-dark");
  await expect(page.getByTestId("map-look").getByTestId("theme-select")).toHaveAttribute("aria-label", "Appearance: Dark");
  await expect.poll(() => lookOf(page)).toBe("normal");
  await pickControl(page, "theme-select", "theme-light");
  await expect(html).not.toHaveClass(/dark/);
  await expect.poll(() => lookOf(page)).toBe("normal");
  await expect(page.getByTestId("map-look").getByRole("slider", { name: "Dimmer" })).toHaveAttribute("aria-valuetext", "0%");
});

/** Each chart layer's brightness as the map draws it (ChartGl's
 *  data-chart-brightness, read from the map at rest): "chart 0.5,...". */
const brightnessOf = (page: Page) => page.getByTestId("gl-map").getAttribute("data-chart-brightness");

test("at night the chart is dimmed at every zoom, the whole country and close in at a field alike", async ({ page }) => {
  test.setTimeout(slow(60000));
  // The whole country, then close in at Oshkosh, where the sectional's own
  // tiles were drawn undimmed under the dimmed region's level (UI audit B10).
  for (const url of ["/app/plan?dep=KPWK&dest=KLAS", "/app/plan?place=KOSH"]) {
    await page.goto(url);
    await settle(page);
    await expect.poll(() => lookOf(page), { timeout: slow(15000) }).toBe("dimmed");
    await expect
      .poll(
        async () => {
          const drawn = (await brightnessOf(page)) ?? "";
          const each = drawn.split(",").filter(Boolean);
          return each.length > 0 && each.every((d) => d.endsWith(" 0.5"));
        },
        { timeout: slow(15000) },
      )
      .toBe(true);
    expect(await brightnessOf(page)).toContain("chart 0.5");
  }
});
