import { test, expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import { closeCard, frontSheet, grabberTo, searchAirports, settle, settled, sheetUpToType, showTabs } from "./helpers";

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

/** `read` sampled after each frame is drawn, for `ms`. */
function frames<T>(page: Page, read: string, ms = 700): Promise<T[]> {
  return page.evaluate(
    ([body, ms]) =>
      new Promise<T[]>((done) => {
        const at = new Function(`return (${body})`) as () => T;
        const out: T[] = [];
        const end = performance.now() + Number(ms);
        const step = () =>
          setTimeout(() => {
            out.push(at());
            if (performance.now() < end) requestAnimationFrame(step);
            else done(out);
          }, 0);
        requestAnimationFrame(step);
      }),
    [read, String(ms)] as const,
  );
}

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
    // the sheet, and it changes size only once the sheet is at rest.
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    await expect(page.locator("[data-foot-strip]").first()).toContainText(/\d/);
    const rest = await page.evaluate(() => document.querySelector('[data-testid="foot-bar"]')!.getBoundingClientRect().bottom);
    await pullDown(page, 120);
    // The sheet's top, the bar's foot and height, and what size the bar shows.
    const settle_ = frames<{ sheet: number; bottom: number; at: string | null }>(
      page,
      `(() => { const s = document.querySelector('[data-swipe-direction="down"]'); const b = document.querySelector('[data-testid="foot-bar"]'); return { sheet: s.getBoundingClientRect().top, bottom: b.getBoundingClientRect().bottom, at: b.getAttribute("data-at") }; })()`,
    );
    await page.mouse.up();
    const seen = await settle_;
    const last = seen.at(-1)!;
    for (let i = 0; i < seen.length; i++) {
      const now = seen[i]!;
      // Its foot never moves, every frame.
      expect(Math.abs(now.bottom - rest), `frame ${i}: the bar still`).toBeLessThanOrEqual(1);
      // Its size is half's until the sheet has come to rest at the pill.
      if (Math.abs(now.sheet - last.sheet) > 0.5) expect(now.at, `frame ${i}: half's size while it moves`).toBe("half");
    }
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
    const tops = frames<number>(page, `document.querySelector('[data-slot="map-panel"]').getBoundingClientRect().top`);
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
