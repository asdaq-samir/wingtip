import { test, expect, type Page } from "@playwright/test";
import { settle, sideDrawer, frontSheet, grabberTo } from "./helpers";

/**
 * A phone's sheet going from the pill to half way and back keeps what it
 * shows where it was, frame by frame: the tabs in their one place under
 * the grabber (the sheet is one shape at every size since the rewrite of
 * 2026-11-04); and with a route, from half all the way up and back (on a
 * phone the pill is one row, the figures shown from half: the fixed snap
 * points, 2026-11-11), the figures at the sheet's visible foot the whole
 * way, where they were once out of sight under it from the turn until the
 * sheet was most of the way up (2026-10-15).
 */

type Frame = { height: number; bar: { top: number } | null; figures: { top: number; bottom: number } | null };

/** Each frame of the sheet's move after `move`: its height, and where its
 *  tabs' row and the route's figures are from its top. */
async function frames(page: Page, move: () => Promise<void>): Promise<Frame[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[] };
    w.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      // The sheet as it shows on the screen: on a phone it is laid out as
      // tall as the larger end and moved by a translate (MapPanel), what
      // is past the screen's edge out of sight.
      const sheet = document.querySelector<HTMLElement>("[data-slot=map-panel]")!;
      const box = sheet.getBoundingClientRect();
      const foot = Math.min(box.bottom, window.innerHeight);
      const panel = { top: box.top, height: foot - box.top };
      const at = (selector: string) => {
        const r = document.querySelector(`[data-slot=map-panel] ${selector}`)?.getBoundingClientRect();
        return r && r.height > 0 ? { top: r.top - panel.top, bottom: r.bottom - panel.top } : null;
      };
      w.__frames.push({ height: panel.height, bar: at("[role=search]"), figures: at("[data-testid=flight-line]") });
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await move();
  await page.waitForTimeout(1400);
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

async function step(page: Page, key: "ArrowUp" | "ArrowDown") {
  await page.getByTestId("sidebar-trigger-button").focus();
  await page.keyboard.press(key);
}

test("on a phone the tabs move with the sheet from the pill to half way and back, not at the turn", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
  for (const key of ["ArrowUp", "ArrowDown"] as const) {
    const seen = await frames(page, () => step(page, key));
    const first = seen[0]!,
      last = seen[seen.length - 1]!;
    expect(first.bar).not.toBeNull();
    expect(last.bar).not.toBeNull();
    // Part of the way between the two sizes, part of the way between the
    // tabs' two places: they come down under the grabber as the sheet
    // comes up, and go back up as it comes down.
    for (const f of seen) {
      if (!f.bar) continue;
      const way = Math.min(1, Math.max(0, (f.height - first.height) / (last.height - first.height)));
      const expected = first.bar!.top + (last.bar!.top - first.bar!.top) * way;
      expect(Math.abs(f.bar.top - expected), `the tabs at ${f.bar.top} in a sheet ${f.height} tall`).toBeLessThan(3);
    }
  }
});

test("on a phone a route's figures stay in sight at the sheet's foot from half all the way up and back", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
  // At the pill the figures are the pill, in the route's row's place (the
  // owner, 2026-11-11, the canvas's b; sheet-page-toggle.spec), and from half on.
  await expect(sideDrawer(page).getByTestId("flight-line")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-box").or(sideDrawer(page).getByTestId("route-line")).first()).toBeHidden();
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("flight-line")).toBeVisible();
  for (const key of ["ArrowUp", "ArrowDown"] as const) {
    const seen = await frames(page, () => step(page, key));
    for (const f of seen) {
      expect(f.figures, `the figures in a sheet ${f.height} tall`).not.toBeNull();
      expect(f.figures!.top, `the figures in a sheet ${f.height} tall`).toBeGreaterThanOrEqual(-1);
      expect(f.figures!.bottom, `the figures in a sheet ${f.height} tall`).toBeLessThanOrEqual(f.height + 1);
    }
  }
});
