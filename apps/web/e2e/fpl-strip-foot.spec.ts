import { test, expect, type Locator, type Page } from "@playwright/test";
import { frontSheet, grabberTo, settle, settled, slow, typeRoute } from "./helpers";
import { pickAirplane } from "./startState";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.beforeEach(({ page }) => pickAirplane(page));

/** The route's plan in, not its estimate: the strip's last figure is the
 *  first leg's course (Crs), which the plan carries and the estimate before
 *  it (Trk, none) does not. Measured before, a nine-stop route on a slow
 *  runner was still "Planning…", its rows not yet their planned height
 *  (CI's desktop, run 45152106014, shard 12). */
async function planIn(strip: Locator) {
  await expect(strip.locator("dt").last()).toContainText("Crs", { timeout: slow(45_000) });
  await expect(strip.getByTestId("navlog-ete")).toBeVisible();
}

/** FPL's foot bar (sheet/FootBar): the figures strip over the tab bar, one
 *  fixed bar beside the sliding sheet (option B of the sheet-motion audit,
 *  2026-11-23). */
const bar = (page: Page) => page.getByTestId("foot-bar");
const strip = (page: Page) => page.locator("[data-foot-strip]").first();

test("a long route scrolled at full: the bar stays still at the screen's foot and the last row scrolls clear above it", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL&view=full");
  await settle(page);
  await grabberTo(page, "full");
  await planIn(strip(page));
  const scroller = page
    .locator("[data-sheet-scroll]")
    .filter({ has: page.locator("[data-foot-room]") })
    .first();
  const room = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(room, "the route is longer than the sheet").toBeGreaterThan(40);
  const rest = (await bar(page).boundingBox())!;
  // On the screen's foot, the figures over the tab bar.
  expect(rest.y + rest.height).toBeGreaterThan(page.viewportSize()!.height - 40);
  for (const at of [0, 0.5, 1]) {
    await scroller.evaluate((el, y) => el.scrollTo(0, y), Math.round(room * at));
    const box = (await bar(page).boundingBox())!;
    expect(box.y, `the bar still at scroll ${at}`).toBeCloseTo(rest.y, 0);
    const s = (await strip(page).boundingBox())!;
    const tabs = (await page.getByTestId("fpl-actions").boundingBox())!;
    expect(s.y + s.height, "the figures over the tabs").toBeLessThanOrEqual(tabs.y + 1);
  }
  // Scrolled to its end, the route's last row sits clear above the bar
  // (the page's end room, the bar's height), nothing tappable behind it.
  await expect(async () => {
    const last = (await page.getByTestId("timeline-add-stop").boundingBox())!;
    expect(last.y + last.height, "the last row clear of the bar").toBeLessThanOrEqual((await bar(page).boundingBox())!.y + 1);
  }).toPass({ timeout: slow(10_000) });
});

test("thin on the tab bar at half and all the way up, the figures alone at the pill's size at the pill", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL");
  await settle(page);
  await grabberTo(page, "half");
  await planIn(strip(page));
  const tabs = page.getByTestId("fpl-actions");
  const [s, b] = [(await strip(page).boundingBox())!, (await tabs.boundingBox())!];
  // The tabs at the very foot, the figures wholly over them, in sight.
  expect(b.y + b.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  expect(s.y + s.height).toBeLessThanOrEqual(b.y + 1);
  // Opaque, nothing faded (the owner, 2026-11-23: "the strip fades the route buttons above it").
  expect(await bar(page).evaluate((el) => getComputedStyle(el, "::before").content)).toMatch(/none|normal/);
  // One thin line (the owner, 2026-11-22: "make the figures strip very thin"), each name short and in sight:
  // the figures' own line, the strip's eight over it its room from the route (9240c429a, the owner's).
  const line = async () => (await strip(page).getByTestId("flight-line").boundingBox())?.height ?? 0;
  expect(await line(), "thin at half").toBeLessThanOrEqual(32);
  for (const name of await strip(page).locator("dt").all()) await expect(name).toBeVisible();
  const names = (await strip(page).locator("dt").allInnerTexts()).join(" ");
  for (const short of ["Dist", "ETE"]) expect(names).toContain(short);
  const height = async () => (await strip(page).boundingBox())?.height ?? 0;
  await grabberTo(page, "peek");
  await expect.poll(height, { message: "the pill's size at the pill" }).toBeGreaterThan(40);
  await expect(tabs).toBeHidden();
  const pill = (await strip(page).boundingBox())!;
  expect(pill.y + pill.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  await grabberTo(page, "full");
  await expect.poll(line, { message: "thin all the way up" }).toBeLessThanOrEqual(32);
  await expect(tabs).toBeVisible();
});

test("pulled slowly down to the pill, the bar stays still and its size holds until the sheet rests", async ({ page }) => {
  // Nothing follows the finger (the sheet-motion audit of 2026-11-23, H1 to
  // H7: the strip led the sheet, jumped into the route, the tabs were cut out).
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await planIn(strip(page));
  const rest = (await bar(page).boundingBox())!;
  const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  let y = grabber.y + grabber.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    y += 12;
    await page.mouse.move(x, y, { steps: 2 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const now = (await bar(page).boundingBox())!;
    expect(now.y, `step ${i}: the bar still`).toBeCloseTo(rest.y, 0);
    expect(now.height, `step ${i}: its size held`).toBeCloseTo(rest.height, 0);
  }
  await page.mouse.up();
  await settled(frontSheet(page));
  await expect(bar(page)).toHaveAttribute("data-at", "peek");
  await expect(page.getByTestId("fpl-actions")).toBeHidden();
});

test("stepped from the pill to half, the strip changes size once, as the step is taken, never back, and the tab bar is the same one", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await planIn(strip(page));
  await page.evaluate(() => document.querySelector('[data-testid="fpl-actions"]')!.setAttribute("data-probe", ""));
  await grabberTo(page, "peek");
  // Each frame after it is drawn: the sheet's top and the strip's height.
  const frames = page.evaluate(
    () =>
      new Promise<{ top: number; h: number }[]>((done) => {
        const out: { top: number; h: number }[] = [];
        const until = performance.now() + 1200;
        const step = () =>
          setTimeout(() => {
            const top = document.querySelector('[data-swipe-direction="down"]')!.getBoundingClientRect().top;
            out.push({ top, h: document.querySelector("[data-foot-strip]")!.getBoundingClientRect().height });
            if (performance.now() < until) requestAnimationFrame(step);
            else done(out);
          }, 0);
        requestAnimationFrame(step);
      }),
  );
  await grabberTo(page, "half");
  const s = await frames;
  const last = s.at(-1)!;
  const rested = s.findIndex((f) => Math.abs(f.top - last.top) < 0.5);
  expect(rested, "the sheet came to rest in the frames sampled").toBeGreaterThan(0);
  // The bar takes the size the sheet is going to as the step is taken
  // (FootBar, b947f97b1): thin by the time the sheet rests, and never the
  // pill's size again once thin.
  const thin = s.findIndex((f) => f.h <= 40);
  expect(thin).toBeGreaterThanOrEqual(0);
  expect(thin).toBeLessThanOrEqual(rested);
  for (const f of s.slice(thin)) expect(f.h, "one change, never back").toBeLessThanOrEqual(40);
  await expect(page.locator('[data-testid="fpl-actions"][data-probe]')).toHaveCount(1);
});

test("with the box turned into the route's field, typed in, the figures stay thin on the tab bar at half and full", async ({ page }) => {
  // The owner, 2026-11-22: "Route box still shows figures full size."
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await planIn(strip(page));
  await typeRoute(page);
  const field = page.getByTestId("route-type");
  const room = (await field.boundingBox())!;
  await field.click({ position: { x: room.width - 8, y: room.height / 2 } });
  await expect(field).toBeFocused();
  for (const size of ["half", "full"] as const) {
    await grabberTo(page, size);
    await expect(strip(page).getByTestId("navlog-ete")).toBeVisible();
    await expect(async () => {
      const box = (await strip(page).boundingBox())!;
      const figures = (await strip(page).getByTestId("flight-line").boundingBox())!;
      expect(figures.height, `thin at ${size}`).toBeLessThanOrEqual(32);
      const tabs = (await page.getByTestId("fpl-actions").boundingBox())!;
      expect(box.y + box.height, `on the tabs at ${size}`).toBeLessThanOrEqual(tabs.y + 1);
    }).toPass({ timeout: slow(10_000) });
  }
});

test.describe("at 375 points and the owner's 19.65-px text", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("the thin strip keeps every name in sight", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = "19.65px"));
    await grabberTo(page, "half");
    await planIn(strip(page));
    for (const name of await strip(page).locator("dt").all()) await expect(name).toBeVisible();
    const box = (await strip(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
  });
});
