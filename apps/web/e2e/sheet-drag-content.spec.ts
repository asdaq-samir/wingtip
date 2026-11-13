import { test, expect, type Page } from "@playwright/test";
import { frontSheet, grabberTo, settle, settled, sideDrawer, slow } from "./helpers";

/**
 * A card or the sheet dragged up from its pill shows its content as it
 * rises, as Apple Maps' card does: the content under the title row is
 * drawn all through the drag, not only once the finger lifts (the owner's
 * iPhone, 2026-11-12: KORD's card blank under its title until let go).
 * Its body at the pill is out of sight (sheet/insets' AT_PILL) and comes
 * back the moment the Drawer marks the drag (data-swiping).
 */
test.use({ hasTouch: true });

/** A finger down on the grabber, slowly up by `dy`, held still mid-drag
 *  while `check` runs, then let go. */
async function slowDragUp(page: Page, dy: number, check: () => Promise<void>) {
  const box = (await frontSheet(page).getByTestId("sidebar-trigger-button").first().boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", q?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: q ? [{ ...q, id: 1 }] : [] });
  await touch("touchStart", at);
  for (let y = 20; y <= dy; y += 20) {
    await touch("touchMove", { x: at.x, y: at.y - y });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  await check();
  await touch("touchEnd");
  await cdp.detach();
}

/** What of the front sheet's body is on screen below its title row and
 *  painted: [in sight, painted]. */
const drawnBelowHead = (page: Page) =>
  frontSheet(page).evaluate((sheet) => {
    const head = sheet.querySelector("[data-sheet-head]")?.getBoundingClientRect().bottom ?? sheet.getBoundingClientRect().top + 80;
    let inSight = 0;
    const unpainted: string[] = [];
    for (const el of sheet.querySelectorAll("button, img, [role=tab], h2, h3, p, li")) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.top < head + 4 || r.bottom > innerHeight) continue;
      if (el.closest("[data-sheet-head], [data-sheet-top]")) continue;
      // Not rendered at all: a row kept for its return, skipped where it
      // waits (SheetParts' kept row, tab-away's content-visibility: hidden),
      // its box still laid out. Hidden by visibility or opacity is what is
      // looked for, below.
      if (!el.checkVisibility()) continue;
      inSight++;
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
        unpainted.push(
          `${el.tagName.toLowerCase()} ${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30)}`,
        );
    }
    return [inSight, unpainted] as const;
  });

test.beforeEach(({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet; the desktop's side panel has no detents");
});

test("an airport card dragged up from its pill shows its content before it is let go", async ({ page }) => {
  await page.goto("/app/plan?place=KORD");
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(20_000) });
  await grabberTo(page, "peek");
  await settled(frontSheet(page));
  await slowDragUp(page, 360, async () => {
    const [inSight, unpainted] = await drawnBelowHead(page);
    expect(inSight, "the card's content risen into sight").toBeGreaterThan(0);
    expect(unpainted, "of it, not painted mid-drag").toEqual([]);
  });
});

test("the sheet dragged up from its pill shows its content before it is let go", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "peek");
  await settled(sideDrawer(page));
  await slowDragUp(page, 360, async () => {
    const [inSight, unpainted] = await drawnBelowHead(page);
    expect(inSight, "the sheet's content risen into sight").toBeGreaterThan(0);
    expect(unpainted, "of it, not painted mid-drag").toEqual([]);
  });
});
