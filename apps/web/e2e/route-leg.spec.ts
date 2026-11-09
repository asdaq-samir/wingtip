import { test, expect, type Page } from "@playwright/test";
import { cardClose, mapStill, settle, slow } from "./helpers";

/**
 * A tap on the course opens its leg, as ForeFlight's does (the owner's
 * screenshot, 2026-11-08): the Route Leg sheet, its ends, Direct to the
 * end, and the leg's distance and magnetic course -- the nav log's leg's,
 * the engine's. A tap a little off the line still finds it (22 either
 * side), and Close puts it away.
 */

type Leg = { key: string; ends: [number, number][] };

/** The legs where they are on the screen (RouteGl's route-legs probe). */
async function legsOnScreen(page: Page): Promise<{ key: string; a: { x: number; y: number }; b: { x: number; y: number } }[]> {
  return page.locator(".maplibregl-map").first().evaluate(map => {
    const r = map.getBoundingClientRect();
    const rows = JSON.parse(map.querySelector("[data-route-legs]")?.getAttribute("data-route-legs") ?? "[]") as { legs: Leg[] }[];
    return (rows[0]?.legs ?? []).map(l => ({
      key: l.key, a: { x: r.left + l.ends[0]![0], y: r.top + l.ends[0]![1] }, b: { x: r.left + l.ends[1]![0], y: r.top + l.ends[1]![1] },
    }));
  });
}

test("a tap beside the course opens its Route Leg sheet, its figures the nav log's", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The legs in, the nav log's figures with them.
  await expect.poll(async () => (await legsOnScreen(page)).length, { timeout: slow(30_000) }).toBeGreaterThan(0);
  await expect(async () => {
    await mapStill(page);
    const legs = await legsOnScreen(page);
    const last = legs.at(-1)!;
    // Half way along the last leg, 16 off it to the side: inside the
    // finger's 22.
    const mx = (last.a.x + last.b.x) / 2, my = (last.a.y + last.b.y) / 2;
    const len = Math.hypot(last.b.x - last.a.x, last.b.y - last.a.y) || 1;
    const nx = -(last.b.y - last.a.y) / len, ny = (last.b.x - last.a.x) / len;
    await page.mouse.click(mx + nx * 16, my + ny * 16);
    await expect(page.getByTestId("route-leg-card")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: slow(20_000) });
  const card = page.getByTestId("route-leg-card");
  await expect(card.getByTestId("route-leg-ends")).toContainText("KDLH");
  // The end is the destination: Direct to it, nothing to remove.
  await expect(card.getByTestId("route-leg-direct")).toContainText("Direct KDLH");
  await expect(card.getByTestId("route-leg-remove")).toHaveCount(0);
  // Not flying: no leg is the active one.
  await expect(card.getByTestId("route-leg-active")).toHaveCount(0);
  await expect(card.getByTestId("route-leg-distance")).toContainText(/\d+\.\d nm/, { timeout: slow(30_000) });
  await expect(card.getByTestId("route-leg-course")).toContainText(/\d{3}°M/);
  // Close goes back one level: the map as it was.
  await cardClose(page, "route-leg-close").click();
  await expect(page.getByTestId("route-leg-card")).toHaveCount(0);
});
