import { test, expect, type Page } from "@playwright/test";
import { mapLook, openMapSettings, pickControl, settle, slow } from "./helpers";

/**
 * The chart's Dimmer and Contrast (the Map card's Look, under its tiles;
 * the owner, 2026-11-18: "can we have a dimmer and contrast sliders under
 * sunlight and remove it from the appearance?"): each the stock slider,
 * set on the chart's layers as it moves (ChartGl's paint, no style made
 * again), read back from the map at rest. Sunlight by day draws the chart
 * at full brightness, the Dimmer greyed but keeping its value; Contrast
 * still adds to sunlight's. In the light theme, whose chart is undimmed by
 * default. At night (the dark theme) the Dimmer holds in sunlight, so a
 * misread light sensor cannot blind the pilot (the owner, 2026-11-18).
 */

/** One paint property of the base chart's layer as the map draws it
 *  (ChartGl's data-chart-brightness and data-chart-contrast: "chart 0.3,..."). */
async function chartPaintOf(page: Page, attribute: "data-chart-brightness" | "data-chart-contrast"): Promise<number | null> {
  const drawn = (await page.getByTestId("gl-map").getAttribute(attribute)) ?? "";
  const chart = drawn.split(",").find((d) => d.startsWith("chart "));
  return chart ? Number(chart.split(" ")[1]) : null;
}

test("the Dimmer and Contrast sliders set the chart's paint as they move, and sunlight undims it", async ({ page }) => {
  test.setTimeout(slow(60_000));
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect.poll(() => chartPaintOf(page, "data-chart-brightness"), { timeout: slow(15_000) }).toBe(1);
  await expect.poll(() => chartPaintOf(page, "data-chart-contrast")).toBe(0.1);

  await openMapSettings(page);
  const look = await mapLook(page);
  // The Appearance menu has no Dark + Bright: the Dimmer took its place.
  await look.getByTestId("theme-select").click();
  await expect(page.getByTestId("theme-dark")).toBeVisible();
  await expect(page.getByTestId("theme-dark-bright")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Dimmer: all the way, the paper's white at 30%.
  const dimmer = look.getByRole("slider", { name: "Dimmer" });
  await expect(dimmer).toHaveAttribute("aria-valuetext", "0%");
  await dimmer.focus();
  await page.keyboard.press("End");
  await expect(dimmer).toHaveAttribute("aria-valuetext", "70%");
  await expect.poll(() => chartPaintOf(page, "data-chart-brightness")).toBe(0.3);

  // Contrast: two steps up, the day's 0.1 and 0.1 more.
  const contrast = look.getByRole("slider", { name: "Contrast" });
  await expect(contrast).toHaveAttribute("aria-valuetext", "0%");
  await contrast.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(contrast).toHaveAttribute("aria-valuetext", "+10%");
  await expect.poll(() => chartPaintOf(page, "data-chart-contrast")).toBe(0.2);

  // Sunlight On: full brightness, the Dimmer greyed with its value kept,
  // the contrast offset on sunlight's 0.2.
  await pickControl(page, "sunlight-select", "sunlight-on");
  await expect(dimmer).toBeDisabled();
  await expect(look.getByText("Full brightness in sunlight")).toBeVisible();
  await expect(dimmer).toHaveAttribute("aria-valuetext", "70%");
  await expect.poll(() => chartPaintOf(page, "data-chart-brightness")).toBe(1);
  await expect.poll(() => chartPaintOf(page, "data-chart-contrast")).toBe(0.3);

  // Off: the Dimmer's value drawn again, and both kept across a reload.
  await pickControl(page, "sunlight-select", "sunlight-off");
  await expect(dimmer).toBeEnabled();
  await expect.poll(() => chartPaintOf(page, "data-chart-brightness")).toBe(0.3);
  await page.reload();
  await settle(page);
  await expect.poll(() => chartPaintOf(page, "data-chart-brightness"), { timeout: slow(15_000) }).toBe(0.3);
  await expect.poll(() => chartPaintOf(page, "data-chart-contrast")).toBe(0.2);
});

test.describe("at night", () => {
  test.use({ colorScheme: "dark" });

  test("sunlight keeps the dark Dimmer, the row enabled with no note, and adds its contrast", async ({ page }) => {
    test.setTimeout(slow(60_000));
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    // The dark theme's default Dimmer: half.
    await expect.poll(() => chartPaintOf(page, "data-chart-brightness"), { timeout: slow(15_000) }).toBe(0.5);

    await openMapSettings(page);
    const look = await mapLook(page);
    const dimmer = look.getByRole("slider", { name: "Dimmer" });
    await pickControl(page, "sunlight-select", "sunlight-on");
    await expect(dimmer).toBeEnabled();
    await expect(look.getByText("Full brightness in sunlight")).toHaveCount(0);
    await expect.poll(() => chartPaintOf(page, "data-chart-brightness")).toBe(0.5);
    // Sunlight's own contrast, 0.2, not the night's 0.13.
    await expect.poll(() => chartPaintOf(page, "data-chart-contrast")).toBe(0.2);

    // Still the pilot's to set, in sunlight too.
    await dimmer.focus();
    await page.keyboard.press("End");
    await expect.poll(() => chartPaintOf(page, "data-chart-brightness")).toBe(0.3);
  });
});
