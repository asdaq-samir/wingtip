import { test, expect, type Locator } from "@playwright/test";
import { grabberTo, settle, slow, typeRoute } from "./helpers";
import { pickAirplane } from "./startState";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.beforeEach(({ page }) => pickAirplane(page));

/** The route's plan in, not its estimate: the strip's last figure is the
 *  first leg's course (Crs), which the plan carries and the estimate before
 *  it (Trk, none) does not. Measured before, a nine-stop route on a slow
 *  runner was still "Planning…", its rows not yet their planned height:
 *  the route no longer than the sheet, its last row 2,423 down against the
 *  figures' 742 (CI's desktop, run 45152106014, shard 12). Within the
 *  test's two minutes, where the strip's ETE was waited on for three. */
async function planIn(strip: Locator) {
  await expect(strip.locator("dt").last()).toContainText("Crs", { timeout: slow(45_000) });
  await expect(strip.getByTestId("navlog-ete")).toBeVisible();
}

/**
 * The route's figures stay on the sheet's foot as a long route scrolls
 * under them (the owner's iPhone, 2026-11-21: a long route at full with
 * approaches, the strip drawn half way up the sheet over the approach's
 * fixes, rows showing below it). usePinAtFoot measured the strip's room
 * at the page's top alone, so its translation was kept as the page scrolled
 * and carried it up through the route; it is measured at each scroll now.
 */
test("a long route scrolled at full: the figures stay at the sheet's foot, no row below them", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's sheet");
  // Nine stops, the route several rows longer than the sheet: with six it
  // was only 40 points longer at a large text size (CI, PR #589), too
  // little room to scroll the strip through.
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL&view=full");
  await settle(page);
  await grabberTo(page, "full");
  const scroller = page
    .locator("[data-sheet-scroll]")
    .filter({ has: page.locator("[data-pin-foot]") })
    .first();
  const strip = page.locator("[data-pin-foot]").first();
  await planIn(strip);
  const room = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(room, "the route is longer than the sheet").toBeGreaterThan(40);
  const foot = (await page.getByTestId("panel-foot").boundingBox())!;
  for (const at of [0, 0.5, 1]) {
    await scroller.evaluate((el, y) => el.scrollTo(0, y), Math.round(room * at));
    await page.waitForTimeout(400);
    const box = (await strip.boundingBox())!;
    // Held on the foot's top (within its own 4-point foot room), just over the tab bar at the sheet's very
    // foot (the owner, 2026-11-22: "the Apple way at the bottom and figures
    // should pin at the bottom of the plan"): never half way up, never
    // under the bar.
    // At the page's end the strip sits in its place under the route's
    // last row, a little over the foot's top: never under the bar, never half way up.
    expect(box.y + box.height, `strip's bottom at scroll ${at}`).toBeLessThanOrEqual(foot.y + 6);
    expect(box.y + box.height, `strip's bottom at scroll ${at}`).toBeGreaterThan(foot.y - 40);
    const bar = (await page.getByTestId("fpl-actions").boundingBox())!;
    expect(bar.y, "the bar under the figures").toBeGreaterThanOrEqual(box.y + box.height - 1);
    // And no list row drawn below it.
    const below = await scroller.evaluate((el, edge) => {
      return [...el.querySelectorAll("[data-pin-foot] ~ *, [data-pill-row] > *")].filter(
        (n) =>
          !n.querySelector("[data-pin-foot]") &&
          !n.matches("[data-pin-foot]") &&
          n.getBoundingClientRect().top > edge &&
          n.getBoundingClientRect().height > 0,
      ).length;
    }, box.y + box.height);
    expect(below).toBe(0);
  }
});

test("the tab bar is at the sheet's foot, the figures over it, and they slide under it to be the pill", async ({ page }) => {
  // The owner, 2026-11-22: "figures should pin at the bottom of the plan
  // and the slide under the tabs to pin to the pill as the card becomes a pill".
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL");
  await settle(page);
  await grabberTo(page, "half");
  const strip = page.locator("[data-pin-foot]").first();
  await planIn(strip);
  const bar = page.getByTestId("fpl-actions");
  const [s, b] = [(await strip.boundingBox())!, (await bar.boundingBox())!];
  // The bar at the very foot, the figures wholly over it, in sight.
  expect(b.y + b.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  expect(s.y + s.height).toBeLessThanOrEqual(b.y + 1);
  expect(await strip.getByTestId("navlog-ete").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  // One thin line at half (the owner, 2026-11-22: "make the figures strip very thin").
  expect(s.height, "thin at half").toBeLessThanOrEqual(32);
  // Each name in sight on the thin strip, short (the owner, 2026-11-22: "Show the labels even for thin strip").
  for (const name of await strip.locator("dt").all()) await expect(name).toBeVisible();
  const names = (await strip.locator("dt").allInnerTexts()).join(" ");
  for (const short of ["Dist", "ETE"]) expect(names).toContain(short);
  // At the pill the figures are its face, full size, on the screen's foot, the bar put away.
  await grabberTo(page, "peek");
  await page.waitForTimeout(600);
  const pill = (await strip.boundingBox())!;
  expect(pill.height, "full size as the pill").toBeGreaterThan(40);
  await grabberTo(page, "full");
  await page.waitForTimeout(600);
  expect((await strip.boundingBox())!.height, "thin all the way up").toBeLessThanOrEqual(32);
  await grabberTo(page, "peek");
  await page.waitForTimeout(600);
  expect(pill.y + pill.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  await expect(bar).toBeHidden();
});

for (const size of ["half", "full"] as const)
  test(`at ${size} the plan's last row scrolls clear of the figures and the bar`, async ({ page }) => {
    // The owner, 2026-11-22: "Figures are overlapping the grouped box at the bottom."
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
    await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL");
    await settle(page);
    await grabberTo(page, size);
    const strip = page.locator("[data-pin-foot]").first();
    await planIn(strip);
    const scroller = page
      .locator("[data-sheet-scroll]")
      .filter({ has: page.locator("[data-pin-foot]") })
      .first();
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(400);
    const last = (await page.getByTestId("timeline-add-stop").boundingBox())!;
    const s = (await strip.boundingBox())!;
    expect(last.y + last.height, "the last row clear of the figures").toBeLessThanOrEqual(s.y + 1);
  });

test("pulled slowly down to the pill, the figures go down with the plan, frame by frame, never held up and then jumping", async ({
  page,
}) => {
  // The owner, 2026-11-22: "doesn't slide down with the plan, waits until it touches the grabber on top".
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  const strip = page.locator("[data-pin-foot]").first();
  await planIn(strip);
  const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  let y = grabber.y + grabber.height / 2;
  const sample = () =>
    page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>('[data-swipe-direction="down"]')!.getBoundingClientRect();
      const fig = document.querySelector<HTMLElement>("[data-pin-foot]")!.getBoundingClientRect();
      return { sheetTop: sheet.top, bottom: fig.bottom, top: fig.top, height: fig.height };
    });
  await page.mouse.move(x, y);
  await page.mouse.down();
  let was = await sample();
  // The screen's foot, less the sheet's 8-point edge, where the figures are held at the pill.
  const foot = (await page.getByTestId("panel-foot").boundingBox())!;
  const edge = foot.y + foot.height;
  for (let i = 0; i < 24; i++) {
    y += 12;
    await page.mouse.move(x, y, { steps: 2 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const now = await sample();
    // With the sheet: never further than the sheet went, nor held while it went.
    const sheetMoved = now.sheetTop - was.sheetTop;
    const moved = now.bottom - was.bottom;
    expect(moved, `step ${i}: no jump`).toBeLessThanOrEqual(Math.max(0, sheetMoved) + 4);
    if (now.bottom < edge - 4) expect(moved, `step ${i}: down with the plan`).toBeGreaterThanOrEqual(sheetMoved - 4);
    // Its size grows in step with the slide toward the pill, a frame at a
    // time, never shrinking nor jumping (the owner, 2026-11-22: "It should
    // follow finger to look natural").
    expect(now.height, `step ${i}: never shrinking`).toBeGreaterThanOrEqual(was.height - 1);
    expect(now.height - was.height, `step ${i}: no jump in size`).toBeLessThanOrEqual(6);
    // Never past the screen's foot.
    expect(now.bottom).toBeLessThanOrEqual(edge + 1);
    was = now;
  }
  const pulled = (await sample()).height;
  await page.mouse.up();
  // Let go short of the pill's room it settles there, full size, with no snap past it.
  await page.waitForTimeout(800);
  expect((await sample()).height).toBeGreaterThanOrEqual(pulled - 1);
});

test("stepped from the pill to half, the strip lands thin as the sheet lands, and the tab bar is the same one", async ({ page }) => {
  // The motion review of 2026-11-22: the figures that are buttons (Dist,
  // ETE) eased their own type for 150 ms behind the sheet, still shrinking
  // 37 to 32 points after it had come to rest; and the tab bar was built
  // afresh at each trip to the pill.
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await planIn(page.locator("[data-pin-foot]").first());
  await page.evaluate(() => document.querySelector('[data-testid="fpl-actions"]')!.setAttribute("data-probe", ""));
  await grabberTo(page, "peek");
  await page.waitForTimeout(800);
  // Each frame after it is drawn: the sheet's top and the strip's height.
  const frames = page.evaluate(
    () =>
      new Promise<{ top: number; h: number }[]>((done) => {
        const out: { top: number; h: number }[] = [];
        const until = performance.now() + 1200;
        const step = () =>
          setTimeout(() => {
            const top = document.querySelector('[data-swipe-direction="down"]')!.getBoundingClientRect().top;
            out.push({ top, h: document.querySelector("[data-pin-foot]")!.getBoundingClientRect().height });
            if (performance.now() < until) requestAnimationFrame(step);
            else done(out);
          }, 0);
        requestAnimationFrame(step);
      }),
  );
  await grabberTo(page, "half");
  const s = await frames;
  const last = s.at(-1)!;
  // From the first frame the sheet is at rest, the strip is at its rest size too.
  const rested = s.findIndex((f) => Math.abs(f.top - last.top) < 0.5);
  expect(rested, "the sheet came to rest in the frames sampled").toBeGreaterThan(0);
  for (const f of s.slice(rested)) expect(Math.abs(f.h - last.h), `landed with the sheet: ${f.h} of ${last.h}`).toBeLessThanOrEqual(0.5);
  expect(last.h).toBeLessThanOrEqual(32);
  await expect(page.locator('[data-testid="fpl-actions"][data-probe]')).toHaveCount(1);
});

test("with the box turned into the route's field, typed in, the figures stay pinned and thin at half and full", async ({ page }) => {
  // The owner, 2026-11-22: "Route box still shows figures full size."
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  const strip = page.locator("[data-pin-foot]").first();
  await planIn(strip);
  await typeRoute(page);
  // Tapped past its last point, where a pilot taps to type on: its middle
  // is whatever the day's route puts there (a fuel stop's pill and the
  // arrow after it, on a day of headwinds), and the arrow asks the search
  // for a stop.
  const field = page.getByTestId("route-type");
  const room = (await field.boundingBox())!;
  await field.click({ position: { x: room.width - 8, y: room.height / 2 } });
  await expect(field).toBeFocused();
  for (const size of ["half", "full"] as const) {
    await grabberTo(page, size);
    await page.waitForTimeout(500);
    await expect(strip.getByTestId("navlog-ete")).toBeVisible();
    const box = (await strip.boundingBox())!;
    expect(box.height, `thin at ${size}`).toBeLessThanOrEqual(32);
    // Pinned at the plan's bottom, on the tab bar (the owner, 2026-11-22:
    // "Route box figures strip is not pinning to the bottom").
    const bar = (await page.getByTestId("fpl-actions").boundingBox())!;
    expect(Math.abs(box.y + box.height - bar.y), `on the bar at ${size}`).toBeLessThanOrEqual(12);
  }
});

test.describe("at 375 points and the owner's 19.65-px text", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("the thin strip keeps every name in sight, wrapping to a second thin row before any is put away", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = "19.65px"));
    await grabberTo(page, "half");
    const strip = page.locator("[data-pin-foot]").first();
    await planIn(strip);
    for (const name of await strip.locator("dt").all()) await expect(name).toBeVisible();
    // Nothing past the screen's side.
    const box = (await strip.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
  });
});
