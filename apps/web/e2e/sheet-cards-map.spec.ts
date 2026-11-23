import { test, expect } from "@playwright/test";
import { closeCard, grabberTo, inSheet, settle, settled, sideDrawer, slow, mapStill } from "./helpers";
import { drawnMarks, markWith } from "./marks";
import { installFrameRecorder } from "./drawnOnce";
import { extrasOn } from "./extras";

/**
 * The map's sheet with a card over it, from sheet-cards.spec (split at 400
 * lines, as scripts/ci/file_sizes.py asks): which card the map's buttons
 * ride, and a card tapped open on the chart coming up at the sheet's top.
 * Drawn once as there (drawnOnce).
 */
test.beforeEach(({ page }) => installFrameRecorder(page));
// The parked features it exercises, on (Settings' Extras, src/lib/extras).
test.beforeEach(({ page }) => extrasOn(page, "atcCopilot"));

test("a card opened over a higher one leaves the map's buttons with the higher", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's cards and their heights");
  const raw = "!DLH 11/101 DLH OBST TOWER LGT (ASN 2026-AGL-1) 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) U/S 2611101200-2611202359";
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KDLH/notams",
    (route) =>
      route.fulfill({
        json: {
          coverage_since: "2026-11-10T06:00:00Z",
          top: 1,
          unchecked: [],
          notams: [
            {
              id: "11/101",
              kind: "notam",
              closed: false,
              raw,
              rank: 1,
              score: 99,
              top: true,
              tied: false,
              in_force: true,
              starts: "2026-11-10T12:00:00Z",
              ends: "2026-11-20T23:59:00Z",
              reasons: [],
              runways: [],
              field: "KDLH",
              keyword: null,
              role: null,
              low_ft: null,
              high_ft: null,
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  const place = sideDrawer(page).getByTestId("place-card");
  // Its drawer's popup, where the buttons ride (the card draws its own head).
  const placeDrawer = sideDrawer(page)
    .locator("[data-sheet-card]")
    .filter({ has: page.getByTestId("place-card") });
  await place.getByRole("tab", { name: "Info" }).click();
  await grabberTo(page, "full");
  const controls = page.locator("[data-map-controls]");
  const radio = page.getByTestId("mic-circle");

  // All the way up, a NOTAM's card over it at half: the buttons give way.
  // Its row reached as a finger would, clear of the card's floating tabs.
  const row = place.getByTestId("place-notam").first();
  await inSheet(page, row);
  await row.click();
  const notam = sideDrawer(page).getByTestId("place-notam-card");
  await expect(notam).toHaveAttribute("data-panel", "half");
  await settled(notam);
  await expect(page.locator("body")).toHaveAttribute("data-map-panel", "full");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "0");
  await expect(radio).toHaveCSS("opacity", "0");

  // The airport's card at half, the NOTAM's over it lowered to its pill:
  // the buttons over the airport card's top, in sight.
  await notam.getByTestId("sheet-card-close").click();
  await expect(notam).toHaveCount(0);
  // At half the row is under the card's edge, where no finger reaches it
  // (the NOTAMs come after the pictures and the details): opened from the
  // keyboard, as it is focusable there.
  await grabberTo(page, "half");
  await row.press("Enter");
  await expect(notam).toHaveAttribute("data-panel", "half");
  await settled(notam);
  await expect(notam.locator("[data-map-controls]")).toHaveCount(1);
  await grabberTo(page, "peek");
  await expect(page.locator("body")).toHaveAttribute("data-map-panel", "half");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "1");
});

// The owner's iPhone, 2026-11-12: "Why are all the cards jumping like
// this?" A card opened from the chart (TFR 6/2478 over San Angelo) came in
// near the top and dropped to half, or arrived at half and shifted again;
// the map panned at each change and again as it closed; and the map's
// buttons sat over the card's lines. A card's drawer mounted already open,
// which Base UI draws where it rests from its first frame, all the way up
// before it has measured itself (CardStack). And the owner's iPhone,
// 2026-11-13: the buttons hidden while a card slid up from the screen's
// foot and back on its top once it was up, "redrawing" at every card. Now
// it comes up where the sheet's top is, as Apple Maps' place card does,
// and eases once to half, the chart still under it, the buttons on its top
// in every frame.
test("a card tapped open on the chart comes up at the sheet's top and eases once to half, its buttons on its top throughout", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's cards and their heights");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  await expect.poll(markWith(page, "route-marks", /^\d+$/), { timeout: slow(60000) }).not.toBeNull();
  const tapped = (await markWith(page, "route-marks", /^\d+$/)())!;
  const sheetTop = (await sideDrawer(page).boundingBox())!.y;
  // Every frame for a second and a half from the tap, as painted: the
  // card's top, the map's buttons, and whether the chart is moving (the
  // map's data-moving, from a move's start to its end).
  const recording = page.evaluate(
    () =>
      new Promise<{ card: number | null; buttons: number | null; shown: boolean; moving: boolean }[]>((done) => {
        const out: { card: number | null; buttons: number | null; shown: boolean; moving: boolean }[] = [];
        const map = document.querySelector<HTMLElement>("[data-testid=gl-map]")!;
        const start = performance.now();
        const frame = () => {
          const card = document.querySelector("[data-sheet-card][data-open]");
          const buttons = document.querySelector("[data-map-controls]");
          out.push({
            card: card ? card.getBoundingClientRect().top : null,
            buttons: buttons ? buttons.getBoundingClientRect().bottom : null,
            shown: !!buttons && getComputedStyle(buttons).opacity !== "0",
            moving: "moving" in map.dataset,
          });
          if (performance.now() - start < 1500) requestAnimationFrame(frame);
          else done(out);
        };
        requestAnimationFrame(frame);
      }),
  );
  await page.mouse.click(tapped.x, tapped.y);
  const frames = await recording;
  const card = sideDrawer(page).locator("[data-sheet-card][data-open]");
  await expect(card).toHaveAttribute("data-panel", "half");
  const tops = frames.map((f) => f.card).filter((top): top is number => top !== null);
  const rest = tops[tops.length - 1]!;
  // Its first frame where the sheet's top was, then one way to where it rests.
  expect(tops[0]!).toBeCloseTo(sheetTop, -1);
  const way = Math.sign(rest - tops[0]!);
  tops.slice(1).forEach((top, i) => expect((top - tops[i]!) * way).toBeGreaterThanOrEqual(-1));
  // The buttons in sight in every frame the card is, over its top.
  for (const f of frames.filter((f) => f.card !== null)) {
    expect(f.shown).toBe(true);
    expect(f.buttons!).toBeLessThanOrEqual(f.card! + 1);
  }
  // The chart moves at most once, to bring the checkpoint out from under
  // the card; the mark tapped ends in sight over it.
  const starts = frames.filter((f, i) => f.moving && !frames[i - 1]?.moving).length;
  expect(starts).toBeLessThanOrEqual(1);
  await mapStill(page);
  const key = tapped.key;
  const at = async () => (await drawnMarks(page, "route-marks")).find((m) => m.key === key) ?? null;
  await expect.poll(async () => (await at())?.y ?? Infinity).toBeLessThan(rest);

  // Put away, the chart stays where it is.
  const before = (await at())!.y;
  await closeCard(page, "sheet-card-close");
  await expect(card).toHaveCount(0);
  await settled(sideDrawer(page));
  await mapStill(page);
  // Within a pixel: the mark's box is rounded as the map's padding is put back.
  expect(Math.abs((await at())!.y - before)).toBeLessThanOrEqual(1.5);
});
