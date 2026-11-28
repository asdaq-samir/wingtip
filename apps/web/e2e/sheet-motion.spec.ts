import { test, expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import { closeCard, frontSheet, grabberTo, searchAirports, settle, settled, sheetUpToType, showTabs, slow } from "./helpers";

/**
 * How the phone's sheet and its cards move when no finger has them (the
 * gestures, apple-design and animation audits of 2026-11-23): FPL's
 * figures ride the plan down through a settle and stop at the foot, never
 * eased straight across the route; a card closed by its ✕ goes with its
 * face on it, not cut; a settings card swiped away carries on down; and
 * with Reduce Motion the sheet still slides, as iOS's does. Read a frame
 * at a time after each frame is drawn.
 */

test.beforeEach(({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's sheet");
});

/**
 * `read` sampled after each frame is drawn, from now until `done` holds and
 * every finite animation on the page has run out: what the steps after the
 * call set going, however long they take to land. A fixed 700 ms window
 * started as the reader did, and on CI's four cores, carrying the stack,
 * the press, the click or the lift that followed it came after the window
 * had shut, so nothing moved in it (PR #591's run: the sheet's top 476 at
 * both ends, the card's close unseen, the foot bar still at half). Never
 * past `cap`, so a sheet that never gets there fails on what it read.
 */
function frames<T>(page: Page, read: string, done: string, cap = slow(10_000)): Promise<T[]> {
  return page.evaluate(
    ([body, until, cap]) =>
      new Promise<T[]>((resolve) => {
        const at = new Function(`return (${body})`) as () => T;
        const there = new Function(`return (${until})`) as () => boolean;
        const moving = () =>
          document.getAnimations().some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);
        const out: T[] = [];
        const end = performance.now() + Number(cap);
        // Arrived, then a frame after it with nothing left moving: an ease
        // starts in the frame after what set it, not in the same task.
        let arrived = false;
        const step = () =>
          setTimeout(() => {
            out.push(at());
            const rest = arrived && !moving();
            arrived = there();
            if (rest || performance.now() > end) resolve(out);
            else requestAnimationFrame(step);
          }, 0);
        requestAnimationFrame(step);
      }),
    [read, done, String(cap)] as const,
  );
}

/** The map's sheet at a size (its data-panel), and no card over it. */
const PANEL_AT = (size: string) => `document.querySelector('[data-slot="map-panel"]')?.getAttribute("data-panel") === "${size}"`;
const NO_CARD = `!document.querySelector("[data-sheet-card]")`;

/** A drag down from the front sheet's grabber by the pointer, let go. */
async function pullDown(page: Page, by: number) {
  const grabber = (await frontSheet(page).getByTestId("sidebar-trigger-button").first().boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  await page.mouse.move(x, grabber.y + 6);
  await page.mouse.down();
  await page.mouse.move(x, grabber.y + by, { steps: 12 });
}

test.describe("by a pointer's drag", () => {
  test.use({ hasTouch: false });

  test("let go toward the pill, FPL's foot bar stays still on the screen's foot and the sheet slides behind it", async ({ page }) => {
    // The figures and the tabs are one fixed bar beside the sheet (sheet/FootBar;
    // the sheet-motion audit of 2026-11-23, option B): nothing in it follows
    // the sheet, and it changes size once, as the finger lifts.
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    await expect(page.locator("[data-foot-strip]").first()).toContainText(/\d/);
    const rest = await page.evaluate(() => document.querySelector('[data-testid="foot-bar"]')!.getBoundingClientRect().bottom);
    // Past half way from half to the pill: the stock Drawer lets go to the
    // nearest snap point when the pointer has stopped (as here, the frames'
    // reader set up before the release), and a 120 px pull, less the 17 px
    // before a swipe starts, came back to half.
    await pullDown(page, 220);
    // The sheet's top, the bar's foot and height, and what size the bar shows.
    const settle_ = frames<{ sheet: number; bottom: number; at: string | null }>(
      page,
      `(() => { const s = document.querySelector('[data-swipe-direction="down"]'); const b = document.querySelector('[data-testid="foot-bar"]'); return { sheet: s.getBoundingClientRect().top, bottom: b.getBoundingClientRect().bottom, at: b.getAttribute("data-at") }; })()`,
      PANEL_AT("peek"),
    );
    await page.mouse.up();
    const seen = await settle_;
    for (let i = 0; i < seen.length; i++) {
      // Its foot never moves, every frame.
      expect(Math.abs(seen[i]!.bottom - rest), `frame ${i}: the bar still`).toBeLessThanOrEqual(1);
    }
    // Its size changes once, as the finger lifts, to the size the sheet is
    // going to, and never back (FootBar, b947f97b1): half's, then the pill's.
    const sizes = seen.map((f) => f.at).filter((at, i, all) => i === 0 || at !== all[i - 1]);
    expect(sizes.at(-1), "the pill's size once let go").toBe("peek");
    expect(sizes.length, "one change").toBeLessThanOrEqual(2);
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
    await expect(page.getByTestId("foot-bar")).toHaveAttribute("data-at", "peek");
  });

  test("You swiped away from half carries on down off the screen, not gone under the finger", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await showPage(page, 0);
    await grabberTo(page, "half");
    await page.getByTestId("account-button").click();
    const you = page.locator("[data-sheet-card]").filter({ has: page.getByTestId("console-sheet") });
    await expect(you).toHaveAttribute("data-panel", "half");
    await settled(you);
    await pullDown(page, 200);
    const going = frames<number | null>(
      page,
      `(() => { const c = [...document.querySelectorAll("[data-sheet-card]")].at(-1); return c ? c.getBoundingClientRect().top : null; })()`,
      NO_CARD,
    );
    const at = (await you.boundingBox())!.y;
    await page.mouse.up();
    const tops = (await going).filter((t): t is number => t !== null);
    expect(
      tops.some((t) => t > at + 40),
      "on down past where the finger let it go",
    ).toBe(true);
    await expect(page.getByTestId("console-sheet")).toHaveCount(0);
  });
});

test("an airport's card closed by its ✕ goes with its face on it, fading, not cut in one frame", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "peek");
  await showTabs(page);
  await page.getByTestId("search-airports").click();
  await sheetUpToType(page);
  await page.getByTestId("search-airports").fill("KUGN");
  await searchAirports(page).filter({ hasText: "KUGN" }).first().click();
  const card = page.getByTestId("place-card");
  await expect(card.getByTestId("fly-here")).toBeEnabled();
  await settled(frontSheet(page));
  const closing = frames<{ opacity: number; text: number } | null>(
    page,
    `(() => { const c = [...document.querySelectorAll("[data-sheet-card]")].at(-1); return c ? { opacity: +getComputedStyle(c).opacity, text: c.innerText.trim().length } : null; })()`,
    NO_CARD,
  );
  await closeCard(page, "place-close");
  const seen = (await closing).filter((f): f is { opacity: number; text: number } => f !== null);
  expect(
    seen.some((f) => f.opacity > 0.05 && f.opacity < 0.95 && f.text > 0),
    "fading with its words on it",
  ).toBe(true);
  await expect(card).toHaveCount(0);
});

test.describe("with Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the sheet still slides between its sizes, as iOS's does, rather than jumping", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    const tops = frames<number>(page, `document.querySelector('[data-slot="map-panel"]').getBoundingClientRect().top`, PANEL_AT("peek"));
    await grabberTo(page, "peek");
    const seen = await tops;
    const [first, last] = [seen[0]!, seen.at(-1)!];
    expect(last).toBeGreaterThan(first + 100);
    expect(
      seen.some((t) => t > first + 20 && t < last - 20),
      "between half and the pill over frames",
    ).toBe(true);
  });
});
