import { test, expect } from "@playwright/test";
import { grabberTo, settle, slow } from "./helpers";

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
      .filter({ has: page.locator("[data-pin-foot]") })
      .first();
    // A finger's flick up, well past the end, with the wheel too.
    const box = (await scroller.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 2000);
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(500);
    const after = (await title.boundingBox())!;
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
  await page.waitForTimeout(400);
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
