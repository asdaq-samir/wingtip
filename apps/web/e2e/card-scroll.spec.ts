import { test, expect, type Page } from "@playwright/test";
import { frontSheet, grabberTo, settled, slow } from "./helpers";
import { CARDS, type CardRow, type Check } from "./cardTable";
import { contentTop, go, hittable, scrollOf } from "./cardEntries";

/**
 * Scrolling every card, by the one scrolling rule (the owner, 2026-11-10;
 * card-tests-spec): for each card of cardTable, scrolled to its end its name
 * and ✕ stay on screen and take a tap (the pinned head); at half a finger's
 * drag up on its body raises the sheet before the body scrolls, and all the
 * way up a drag down from its top lowers it; at twice the text size its
 * last row is still reached; a sideways row slides without moving the
 * sheet; and its place is kept going back to it. A phone's sheet: the
 * desktop's side panel has no detents to drag between. A check a card is
 * excused from says why (cardTable's `not`). The sheet dragged is the
 * card's own nested drawer, its own snap point (CardStack), or the map's
 * sheet for a page of the plan (frontSheet).
 */

const panel = (page: Page) => frontSheet(page);

async function open(page: Page, row: CardRow) {
  await row.entries[0]!.open(page);
  await expect(page.getByTestId(row.card)).toBeVisible({ timeout: slow(20_000) });
  await settled(panel(page));
}

/** A finger's drag, by the browser's own touch events (CDP), as traffic.spec drags the sheet. */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", q?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: q ? [{ ...q, id: 1 }] : [] });
  await touch("touchStart", from);
  for (let i = 1; i <= 8; i++) await touch("touchMove", { x: from.x + (dx * i) / 8, y: from.y + (dy * i) / 8 });
  await touch("touchEnd");
}

/** The middle of the card's body, a third of the way down what is on screen of it. */
async function bodyPoint(page: Page, row: CardRow) {
  const box = (await page.getByTestId(row.card).boundingBox())!;
  const view = page.viewportSize()!;
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, view.height);
  return { x: box.x + box.width / 2, y: top + (bottom - top) / 3 };
}

/** The reason a card is excused from a check, or none. */
const excused = (row: CardRow, check: Check) => row.not?.[check];

for (const row of CARDS) {
  test.describe(`${row.name}`, () => {
    test.beforeEach(({ page }) => {
      test.skip(page.viewportSize()!.width >= 768, "a phone's sheet; the desktop's side panel has no detents");
    });

    test("scrolled to its end, its name and ✕ are still in sight and take a tap", async ({ page }) => {
      test.skip(!!excused(row, "scroll"), excused(row, "scroll") ?? "");
      await open(page, row);
      await grabberTo(page, "full");
      await scrollOf(page, row.card, "end");
      await expect.poll(() => hittable(page, [`${row.close}-pinned`, row.close]), { timeout: slow(10_000) }).not.toBeNull();
      // The pinned head at the sheet's content top, nothing of the card's
      // body in sight over it (the owner's iPhone, 2026-11-10: it sat 40%
      // down the sheet, the chart tiles scrolling by above it).
      const pinned = page.getByTestId(row.card).getByTestId("card-head-pinned");
      if (await pinned.isVisible()) {
        const head = (await pinned.boundingBox())!;
        // The card's own drawer's scroller (CardStack), or the sheet's for a page of the plan.
        const top = await contentTop(page, row.card);
        expect(Math.abs(head.y - top), "the pinned head's top against the card's content top").toBeLessThanOrEqual(2);
        const over = await page.evaluate(
          ([x, y, card]) => {
            const at = document.elementFromPoint(x, y);
            return !!at && !!at.closest(`[data-testid="${card}"]`) && !at.closest('[data-testid="card-head-pinned"]');
          },
          [head.x + head.width / 2, head.y - 3, row.card] as const,
        );
        expect(over, "the card's body in sight over its pinned head").toBe(false);
      }
    });

    test("at half a drag up on its body raises the sheet before the body scrolls", async ({ page }) => {
      test.skip(!!excused(row, "dragUp"), excused(row, "dragUp") ?? "");
      await open(page, row);
      await grabberTo(page, "half");
      const before = await scrollOf(page, row.card);
      await drag(page, await bodyPoint(page, row), 0, -160);
      await expect(panel(page)).toHaveAttribute("data-panel", "full");
      await settled(panel(page));
      // Not scrolled: at the top (0), or with nothing to scroll (-1) -- a body
      // that fits at half has no scroller until the sheet grows.
      expect(Math.max((await scrollOf(page, row.card)).top, 0)).toBe(Math.max(before.top, 0));
    });

    test("all the way up, a drag down from its top lowers the sheet", async ({ page }) => {
      test.skip(!!excused(row, "dragDown"), excused(row, "dragDown") ?? "");
      await open(page, row);
      await grabberTo(page, "full");
      await scrollOf(page, row.card, 0);
      await drag(page, await bodyPoint(page, row), 0, 200);
      await expect(panel(page)).not.toHaveAttribute("data-panel", "full");
    });

    test("at twice the text size its last row is reached and takes a tap", async ({ page }) => {
      test.skip(!!excused(row, "textSize"), excused(row, "textSize") ?? "");
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "32px"));
      });
      await open(page, row);
      await grabberTo(page, "full");
      await scrollOf(page, row.card, "end");
      const last = page.getByTestId(row.card).locator("button:visible, a:visible, [role=tab]:visible").last();
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      const hit = await last.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!at && (el === at || el.contains(at));
      });
      expect(hit, "the last control is the topmost thing at its middle").toBe(true);
    });

    test("a sideways row slides sideways and leaves the sheet where it was", async ({ page }) => {
      test.skip(!row.sideways, excused(row, "sideways") ?? "no sideways row");
      await open(page, row);
      await grabberTo(page, "full");
      const strip = page.getByTestId(row.sideways!);
      await strip.scrollIntoViewIfNeeded();
      const first = strip.locator(":scope > * > * > *").first();
      const was = (await first.boundingBox())!;
      const box = (await strip.boundingBox())!;
      await drag(page, { x: box.x + box.width * 0.8, y: box.y + box.height / 2 }, -box.width * 0.6, 0);
      await expect.poll(async () => (await first.boundingBox())!.x, { timeout: slow(5_000) }).toBeLessThan(was.x - 10);
      await expect(panel(page)).toHaveAttribute("data-panel", "full");
    });

    test("its place is kept going back to it; a new one of its kind starts at the top", async ({ page }) => {
      test.skip(!row.inside, excused(row, "position") ?? "nothing opens inside it");
      await open(page, row);
      await grabberTo(page, "full");
      const { max } = await scrollOf(page, row.card);
      test.skip(max < 40, "too short to scroll at this size");
      const at = (await scrollOf(page, row.card, Math.round(max / 2))).top;
      await row.inside!.open(page);
      await row.inside!.back(page);
      await expect.poll(async () => (await scrollOf(page, row.card)).top, { timeout: slow(5_000) }).toBeGreaterThanOrEqual(at - 2);
      if (row.card === "place-card") {
        // Another field's card: from its top.
        await go(page, "/app/plan?place=KMSP");
        await expect(page.getByTestId(row.card)).toBeVisible({ timeout: slow(20_000) });
        expect((await scrollOf(page, row.card)).top).toBeLessThanOrEqual(0);
      }
    });
  });
}

/**
 * The airport card opened FROM THE PILL, the path that failed on the
 * owner's iPhone (2026-11-10): the search row went as the sheet rose, the
 * head's height was not measured again, and the card's pinned head sat
 * that far down the sheet with the card scrolling above it. Nothing is
 * measured now (the head sticky in the sheet's one scroller); this holds
 * it. At the bottom edge and in the top layout (the preferences' navBar
 * "top") alike.
 */
for (const edge of ["bottom", "top"] as const) {
  test(`opened from the pill (${edge} layout), scrolled to its end, its pinned head is at the sheet's content top`, async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
    if (edge === "top") {
      await page.addInitScript(() => {
        const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":7}');
        localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, navBar: "top" } }));
      });
    }
    const row = CARDS.find((r) => r.name === "airport")!;
    const entry = row.entries.find((e) => e.name === "map tap")!;
    await entry.open(page);
    await expect(page.getByTestId(row.card)).toBeVisible({ timeout: slow(20_000) });
    await settled(panel(page));
    await grabberTo(page, "full");
    await scrollOf(page, row.card, "end");
    const pinned = page.getByTestId(row.card).getByTestId("card-head-pinned").first();
    await expect(pinned).toBeVisible();
    await expect(async () => {
      const head = (await pinned.boundingBox())!;
      expect(Math.abs(head.y - (await contentTop(page, row.card)))).toBeLessThanOrEqual(2);
    }).toPass({ timeout: slow(5_000) });
    const head = (await pinned.boundingBox())!;
    const over = await page.evaluate(
      ([x, y, card]) => {
        const at = document.elementFromPoint(x, y);
        return !!at && !!at.closest(`[data-testid="${card}"]`) && !at.closest('[data-testid="card-head-pinned"]');
      },
      [head.x + head.width / 2, head.y - 3, row.card] as const,
    );
    expect(over, "the card's body in sight over its pinned head").toBe(false);
  });
}

/**
 * The airport card's tabs with the bar pinned (the owner's recording,
 * 2026-11-11): Weather scrolled down, a tap on Info opened Info part way
 * down, at its foot, and a tap on Runways, short, threw the card back to
 * its top with the bar dropped below the photos. Now a tab not yet seen
 * opens at its own top under the pinned bar, a short one keeps the bar
 * where it pinned, and a tab seen before is where it was.
 */
test("the airport card's tabs, the bar pinned, open each at its top and keep the bar in place", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  const row = CARDS.find((r) => r.name === "airport")!;
  await open(page, row);
  await grabberTo(page, "full");
  const card = page.getByTestId(row.card);
  const bar = card.getByRole("tablist");
  await card.getByTestId("place-tab-weather").click();
  const { max } = await scrollOf(page, row.card);
  test.skip(max < 200, "too short to pin the bar at this size");
  const deep = (await scrollOf(page, row.card, max)).top;
  const pinnedY = (await bar.boundingBox())!.y;
  const underBar = async (testId: string) => {
    const panel = (await card.getByRole("tabpanel").boundingBox())!;
    const b = (await bar.boundingBox())!;
    expect(Math.abs(b.y - pinnedY), `the bar stays pinned on ${testId}`).toBeLessThanOrEqual(2);
    expect(Math.abs(panel.y - (b.y + b.height)), `${testId} opens at its top, under the bar`).toBeLessThanOrEqual(16);
  };
  await card.getByTestId("place-tab-radio").click();
  await expect(async () => underBar("Info")).toPass({ timeout: slow(5_000) });
  await card.getByTestId("place-tab-runways").click();
  await expect(async () => underBar("Runways")).toPass({ timeout: slow(5_000) });
  // Weather, seen before: where it was.
  await card.getByTestId("place-tab-weather").click();
  await expect.poll(async () => (await scrollOf(page, row.card)).top, { timeout: slow(5_000) }).toBeGreaterThanOrEqual(deep - 2);
});
