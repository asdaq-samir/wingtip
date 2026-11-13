import { test, expect, type Page } from "@playwright/test";
import { closeSidebarWithTheStockKey, expectDrawerClosed, mapStill, openPanel, settle, settled, sideDrawer, slow } from "./helpers";
import { courseBox } from "./mapProbes";

/**
 * The route changed in its box: every point sits as close to its arrows
 * as the next, and the map fits the whole course again into the room
 * above the sheet, a stop taken out as much as a new destination, and
 * the sheet turning under the fit (the owner, 2026-11-11: "Look at the
 * spacing of first airport in route and also it didn't center the
 * course on the map").
 */

/** The course inside the room above a phone's sheet, its middle the
 *  room's middle, give or take the margin's rounding. */
async function centredAboveSheet(page: Page) {
  await expect(async () => {
    const line = await courseBox(page);
    const sheet = (await sideDrawer(page).boundingBox())!;
    expect(line.y, "the course's top on the screen").toBeGreaterThanOrEqual(0);
    expect(line.y + line.height, "the course clear of the sheet").toBeLessThanOrEqual(sheet.y);
    expect(Math.abs(line.y + line.height / 2 - sheet.y / 2), `course ${JSON.stringify(line)} above the sheet at ${sheet.y}`).toBeLessThan(
      24,
    );
  }).toPass({ timeout: slow(10_000) });
}

test("the route box's pills sit as close to their marks and arrows as each other, a three-letter departure too", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&stops=KUGN&dest=KPWK");
  await settle(page);
  await openPanel(page);
  const slide = sideDrawer(page).getByTestId("route-slide");
  await expect(slide.getByRole("group")).toHaveCount(3);
  // Each pill's ident, from its mark's right to the next arrow's glyph:
  // five letters wide, C81 sat 14 points short of its arrow to KUGN's 6.
  // Each point is a token of the field of its own (React Aria's), the arrow
  // to the next at the head of the next one's: the arrows in order, the
  // i-th after the i-th pill.
  const gaps = await slide.evaluate((el) => {
    const arrows = [...el.querySelectorAll<HTMLElement>('[data-testid="route-arrow"] svg')];
    return [...el.querySelectorAll<HTMLElement>("[role=group]")].map((pill, i) => {
      const mark = pill.firstElementChild!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(pill.querySelector("button")!);
      const text = range.getBoundingClientRect();
      const arrow = arrows[i]?.getBoundingClientRect();
      return { before: text.left - mark.right, after: arrow ? arrow.left - text.right : null };
    });
  });
  const befores = gaps.map((g) => g.before);
  expect(Math.max(...befores) - Math.min(...befores), JSON.stringify(gaps)).toBeLessThan(1.5);
  const afters = gaps.flatMap((g) => (g.after === null ? [] : [g.after]));
  expect(afters).toHaveLength(2);
  expect(Math.abs(afters[0]! - afters[1]!), JSON.stringify(gaps)).toBeLessThan(1.5);
});

test("a stop taken out fits the map to the course again, above the half sheet", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet; from md up the card is at the side");
  await page.goto("/app/plan?dep=C81&stops=KDPA&dest=KPWK");
  await settle(page);
  await openPanel(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  // The same two ends: the fit was once per departure and destination,
  // and a stop put in or taken out left the map where it was.
  await sideDrawer(page).getByRole("group", { name: "Stop 1 KDPA" }).focus();
  await page.keyboard.press("Delete");
  await expect(page).not.toHaveURL(/[?&]stops=/);
  await mapStill(page);
  await centredAboveSheet(page);
});

test("a destination typed as the sheet goes down is fitted to the room the sheet leaves, not left half way", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet; from md up the card is at the side");
  await page.goto("/app/plan?dep=C81&dest=KUGN");
  await settle(page);
  await openPanel(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  const field = sideDrawer(page).getByTestId("route-type");
  await field.fill("KPWK");
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]dest=KPWK(&|$)/);
  // Lowered while the fit flies, as the keyboard going or a flick of the
  // grabber turns it: the sheet's own ease of the padding stopped the
  // fit where it was, the course off the middle and part under the sheet.
  await expect(page.getByTestId("gl-map")).toHaveAttribute("data-moving", "", { timeout: slow(10_000) });
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await mapStill(page);
  await centredAboveSheet(page);
});
