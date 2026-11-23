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

  test("let go toward the pill, FPL's figures ride the plan down and stop on the foot, never sliding ahead or over it", async ({
    page,
  }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    await expect(page.locator("[data-pin-foot]").first()).toContainText(/\d/);
    const edge = await page.evaluate(() => document.querySelector('[data-testid="panel-foot"]')!.getBoundingClientRect().bottom);
    await pullDown(page, 120);
    // The sheet's top and slide, the figures' foot, the body's cut where it has one, and the foot's place.
    const settle_ = frames<{ sheet: number; slid: number; bottom: number; cut: number | null; foot: number }>(
      page,
      `(() => { const s = document.querySelector('[data-swipe-direction="down"]'); const cut = /inset\\(0px 0px ([\\d.]+)px/.exec([...document.querySelectorAll("[data-sheet-scroll]")].map((e) => getComputedStyle(e).clipPath).find((c) => c.startsWith("inset")) ?? ""); return { sheet: s.getBoundingClientRect().top, slid: new DOMMatrixReadOnly(getComputedStyle(s).transform).m42, bottom: document.querySelector("[data-pin-foot]").getBoundingClientRect().bottom, cut: cut ? +cut[1] : null, foot: document.querySelector('[data-testid="panel-foot"]').getBoundingClientRect().bottom }; })()`,
    );
    await page.mouse.up();
    const seen = await settle_;
    for (let i = 1; i < seen.length; i++) {
      const [was, now] = [seen[i - 1]!, seen[i]!];
      const sheet = now.sheet - was.sheet;
      const fig = now.bottom - was.bottom;
      // Never ahead of the plan it rides, never back up, never past the foot.
      expect(fig, `frame ${i}: not ahead of the sheet`).toBeLessThanOrEqual(Math.max(0, sheet) + 2);
      expect(fig, `frame ${i}: never back up`).toBeGreaterThanOrEqual(-2);
      expect(now.bottom, `frame ${i}: never past the foot`).toBeLessThanOrEqual(edge + 1);
      // Short of the foot it goes with the plan, not a share of its speed.
      if (now.bottom < edge - 6 && sheet > 2) expect(fig, `frame ${i}: down with the plan`).toBeGreaterThanOrEqual(sheet - 3);
      // The foot held still on the screen's edge, and the body's cut where the sheet is, every frame.
      expect(Math.abs(now.foot - edge), `frame ${i}: the foot still`).toBeLessThanOrEqual(1);
      if (now.cut !== null) expect(Math.abs(now.cut - now.slid), `frame ${i}: the cut with the sheet`).toBeLessThanOrEqual(2);
    }
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
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
