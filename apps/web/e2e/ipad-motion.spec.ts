import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, sideDrawer } from "./helpers";
import { pick } from "./cardEntries";

/**
 * On an iPad (the webkit-ipad project), what the pilot touches moves with
 * the map that makes room for it, on the Drawer's time: a card in the
 * inspector slides in from the right edge and fades, and goes the way it
 * came; the side panel's edge glides between its head and the window's
 * height (the apple-design audit of 2026-11-23, H1 and H2). Each was there
 * or gone in one frame while the map eased beside it. Read a frame at a
 * time after each frame is drawn.
 */

/** `read` sampled after each frame is drawn, for `ms`. */
function frames<T>(page: Page, read: string, ms = 600): Promise<T[]> {
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

test("on an iPad on its side a card in the inspector comes in from its edge and fades, and leaves the way it came", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  const opening = frames<{ opacity: number; x: number } | null>(
    page,
    `(() => { const c = document.querySelector('[data-slot="map-inspector"] [data-sheet-card]'); if (!c) return null; return { opacity: +getComputedStyle(c).opacity, x: c.getBoundingClientRect().x }; })()`,
    4000,
  );
  await pick(page, "KORD", "airport");
  const seen = (await opening).filter((f): f is { opacity: number; x: number } => f !== null);
  expect(
    seen.some((f) => f.opacity > 0.05 && f.opacity < 0.95),
    "faded in, not there in one frame",
  ).toBe(true);
  const rest = seen.at(-1)!;
  expect(rest.opacity).toBeCloseTo(1, 1);
  expect(
    seen.some((f) => f.x > rest.x + 1),
    "came in from the right edge",
  ).toBe(true);
  const card = page.locator('[data-slot="map-inspector"] [data-sheet-card][data-open]');
  const closing = frames<number | null>(
    page,
    `(() => { const c = document.querySelector('[data-slot="map-inspector"] [data-sheet-card]'); return c ? +getComputedStyle(c).opacity : null; })()`,
  );
  await card.focus();
  await page.keyboard.press("Escape");
  const out = (await closing).filter((o): o is number => o !== null);
  expect(
    out.some((o) => o > 0.05 && o < 0.95),
    "faded out, not cut",
  ).toBe(true);
});

test("on an iPad the side panel's edge glides between its head and the window's height", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/app/plan");
  await settle(page);
  await expect(sideDrawer(page)).toBeVisible();
  // Out, at the size it opens at (half and all the way up are one box beside the map).
  const open = (await sideDrawer(page).getAttribute("data-panel")) as "half" | "full";
  expect(open).not.toBe("peek");
  // Its visible bottom: its box, less any clip easing in or out.
  const bottom = `(() => { const p = document.querySelector('[data-slot="map-panel"]'); const r = p.getBoundingClientRect(); const m = /inset\\(0px 0px ([\\d.]+)px/.exec(getComputedStyle(p).clipPath); return r.bottom - (m ? +m[1] : 0); })()`;
  const putIn = frames<boolean>(page, `!!document.querySelector("[data-side-glide]")`);
  await grabberTo(page, "peek");
  expect((await putIn).some(Boolean), "its ground closed up to the head over frames").toBe(true);
  await expect(page.locator("[data-side-glide]")).toHaveCount(0);
  const inEnd = await page.evaluate(bottom);
  const out = frames<number>(page, bottom);
  await grabberTo(page, open);
  const outSteps = await out;
  const outEnd = outSteps.at(-1)!;
  expect(outEnd).toBeGreaterThan(inEnd + 100);
  expect(
    outSteps.some((b) => b > inEnd + 20 && b < outEnd - 20),
    "uncovered over frames, not in one",
  ).toBe(true);
});
