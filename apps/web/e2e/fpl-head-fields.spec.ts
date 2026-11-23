import { test, expect } from "@playwright/test";
import { controlsInSight, grabberTo, openProfile, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";
import { steady, watchFor } from "./pacing";

/**
 * FPL's head stays put and its two pills behave as fields (the owner,
 * 2026-11-22): the plan's rows scroll and stop at their end, the title row
 * never carried off ("When I scroll up on the plan, it keeps scrolling up
 * and the title disappears"); the cruise altitude can be emptied ("FL
 * input is not letting me clear it"); the N-number is one width with five
 * places after "N-" ("N input should be fixed size with 5 underscores
 * after N-").
 */
const LONG = "/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL";

for (const size of ["half", "full"] as const)
  test(`scrolled up past the plan's end at ${size}, FPL's title row does not move`, async ({ page }) => {
    await page.goto(LONG);
    await settle(page);
    await grabberTo(page, size);
    const title = page.getByTestId("fpl-head").first();
    await expect(title).toBeVisible({ timeout: slow(60_000) });
    const before = (await title.boundingBox())!;
    const scroller = page
      .locator("[data-sheet-scroll]")
      .filter({ has: page.locator("[data-foot-room]") })
      .first();
    // A finger's flick up, well past the end, with the wheel too.
    const box = (await scroller.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 2000);
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    // Where it is once the scroll has come to rest.
    const after = (await steady(() => title.boundingBox()))!;
    expect(Math.abs(after.y - before.y), "the title row stays put").toBeLessThan(2);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    expect(await scroller.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("contain");
  });

test("the cruise altitude can be emptied as it is typed, and left empty goes back to the figure flown", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KMSN");
  await settle(page);
  await grabberTo(page, "half");
  const field = page.getByTestId("altitude-input");
  await expect(field).not.toHaveValue("", { timeout: slow(60_000) });
  const flown = await field.inputValue();
  await field.click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await expect(field).toHaveValue("");
  await watchFor(page, 400);
  await expect(field, "still empty while it is typed in").toHaveValue("");
  await page.keyboard.type("08");
  await expect(field).toHaveValue("08");
  for (let i = 0; i < 2; i++) await page.keyboard.press("Backspace");
  await expect(field).toHaveValue("");
  await field.blur();
  await expect(field).toHaveValue(flown);
});

test("the N-number is one width with five places after N-, whatever is typed", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KMSN");
  await settle(page);
  await grabberTo(page, "half");
  const field = page.getByTestId("aircraft-input");
  await expect(field).toBeVisible({ timeout: slow(60_000) });
  await field.click();
  await field.fill("");
  const empty = (await field.boundingBox())!.width;
  await expect(field).toHaveAttribute("placeholder", "_____");
  for (const typed of ["1", "12", "123M", "123MM"]) {
    await field.fill(typed);
    expect(Math.abs((await field.boundingBox())!.width - empty), `${typed}: one width`).toBeLessThan(1);
    // The whole of what is typed in sight, none cut off.
    expect(await field.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await field.fill("123456");
  await expect(field).toHaveValue("12345");
});

test("the Profile's FL field at a waypoint empties with Backspace, and is written in three figures once left", async ({ page }) => {
  // Padded as it was typed, "025" Backspaced read "99", then "9" (the
  // owner, 2026-11-22: "FL input is not letting me clear it").
  await pickAirplane(page);
  await page.goto("/app/plan?dep=C81&stops=VPBNG&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/\d,\d{3} feet|FL\d{3}/, { timeout: slow(60000) });
  await openProfile(page);
  await page.getByTestId("profile-card").getByRole("button", { name: "VPBNG: set the altitude at it" }).click();
  const field = page.getByTestId("leg-altitude-input");
  await field.click();
  await page.keyboard.press("End");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await expect(field).toHaveValue("");
  await page.keyboard.type("45");
  await expect(field).toHaveValue("45");
  await field.blur();
  await expect(field).toHaveValue("045");
});

test.describe("at 375 points", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("the grouped box's last row holds Add a Stop, the fuel stops' pill and the route's toggle, the toggle at its right", async ({
    page,
  }) => {
    // The owner, 2026-11-22: "Toggle and remove fuel stops pills go to next
    // line"; "the route box toggle should be pinned to the bottom right".
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
    await page.goto("/app/plan?dep=KPWK&dest=KLAS");
    await settle(page);
    await grabberTo(page, "full");
    const add = page.getByTestId("timeline-add-stop");
    const toggle = page.getByTestId("route-type-open");
    await expect(toggle).toBeVisible({ timeout: slow(90_000) });
    const fuel = page.getByTestId("timeline-fuel-stops");
    const rows = [await add.boundingBox(), await toggle.boundingBox(), (await fuel.count()) ? await fuel.boundingBox() : null].filter(
      (b): b is NonNullable<typeof b> => !!b,
    );
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    for (const b of rows) expect(Math.abs(mid(b) - mid(rows[0]!)), "one line").toBeLessThan(4);
    const card = (await page.getByTestId("route-summary").boundingBox())!;
    const t = rows[1]!;
    expect(card.x + card.width - (t.x + t.width), "at the box's right").toBeLessThan(16);
  });
});
