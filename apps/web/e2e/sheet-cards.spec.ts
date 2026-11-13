import { test, expect, type Page } from "@playwright/test";
import {
  cardClose,
  closeCard,
  grabberTo,
  openMapSettings,
  openTab,
  settle,
  settled,
  sideDrawer,
  slow,
  tapTheChart,
  mapStill,
} from "./helpers";
import { drawnMarks, markWith, tapMark, type DrawnMark } from "./marks";

/**
 * What a control opens (ResponsivePopover, on a phone) and what a tap on
 * the chart opens (MapPopup) is a card floating over the map and its sheet,
 * as Apple Maps' iOS 27 cards float (the owner, 2026-11-13: "Except for
 * airport card, redesign the others as recommended"): the stock Dialog in
 * You's floating shell (FloatingCard), ten points in from the sides and
 * the foot, as tall as it is, the sheet under it left where it was. Its
 * close, Escape and a device's Back put it away, back to what was under
 * it; one opened from another floats over it and closes back to it.
 * An airport's card alone rides the sheet (CardStack).
 */

test("the Map settings float over the map, the sheet left as it was, and its close goes back to what was under it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet and its heights; the side panel's card is in layout.spec");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  const sheetTop = (await panel.boundingBox())!.y;

  // From the pill: the card floating over it, ten points in from the
  // screen's sides and foot, the panel left at the pill where it was.
  await openMapSettings(page);
  const card = page.getByRole("dialog", { name: "Map", exact: true });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-testid", "map-settings");
  await expect(card).toHaveAttribute("data-floating-card", "");
  await expect(panel.getByTestId("map-settings")).toHaveCount(0);
  const view = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box.x).toBeCloseTo(10, 0);
  expect(view.width - box.x - box.width).toBeCloseTo(10, 0);
  expect(view.height - box.y - box.height).toBeCloseTo(10, 0);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  expect((await panel.boundingBox())!.y).toBeCloseTo(sheetTop, 0);
  // No dim over the map: it is no modal.
  await expect(page.locator("[data-slot=dialog-overlay], [data-slot=sheet-content]")).toHaveCount(0);
  // Its name where a screen reader starts reading it, in its head row.
  await expect(card.getByRole("heading", { name: "Map", level: 2 })).toBeFocused();
  await closeCard(page, "sheet-card-close");
  await expect(card).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-panel", "peek");

  // From half, over the route's box: the box left as it was under it, and
  // Escape puts the card away, the panel still half way and the focus back
  // on the map's button.
  await grabberTo(page, "half");
  const dest = panel.getByTestId("route-dest");
  await expect(dest).toBeVisible();
  await openMapSettings(page);
  await expect(card).toBeVisible();
  await expect(panel).toHaveAttribute("data-panel", "half");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-panel", "half");
  await expect(dest).toBeVisible();
  await expect(page.locator("[data-map-controls]").getByTestId("map-settings-button")).toBeFocused();
});

// The owner, 2026-11-11, on the live stack in WebKit: the Map button's
// card opened and closed at once, aria-expanded true and then false. The
// map's buttons ride the front sheet's top, a card's once one is open
// (OnSheetTop), and moved there they were drawn afresh, the button's own
// open state with them; the Map card's open is its own (lib/mapCard) and
// the buttons keep one container (sheetTopSlot).
test("the Map button's card stays open once tapped, and the button says so", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  const button = page.locator("[data-map-controls]").getByTestId("map-settings-button");
  await button.click();
  const card = page.getByTestId("map-settings");
  await expect(card).toBeVisible();
  await settled(card);
  // Still open once the sheet has settled, the buttons on the card's top.
  await settled(sideDrawer(page));
  await expect(card).toBeVisible();
  await expect(page.locator("[data-map-controls]").getByTestId("map-settings-button")).toHaveAttribute("aria-expanded", "true");
  // Tapped again, it closes.
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  await expect(card).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

// The owner, 2026-11-13: "put a settings button on the top left side". The
// Map card's head starts with a gear that opens the app's Settings as a
// card over it, at its Map group (option A, the same day); Settings' ✕
// goes back one level, to the Map card, which has no Map Settings now.
test("the Map card's gear opens Settings over it at Map, and Settings' close goes back to the Map card", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await openMapSettings(page);
  const card = page.getByTestId("map-settings");
  await expect(card).toBeVisible();
  const gear = card.getByRole("button", { name: "Settings", exact: true });
  await expect(gear).toBeVisible();
  // At the head's start, left of the name, as a card's Share is.
  const name = card.getByRole("heading", { name: "Map", level: 2 });
  expect((await gear.boundingBox())!.x).toBeLessThan((await name.boundingBox())!.x);
  await gear.click();
  const settings = page.getByTestId("console-sheet");
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Settings", level: 3 })).toBeVisible();
  // Raised all the way, its Map group in sight.
  await expect(settings.getByTestId("airport-weather-look")).toBeInViewport();
  await settings.getByRole("button", { name: "Back to the map", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("map-settings-more")).toHaveCount(0);
});

test("the approaches' pull-down is a floating card, and the list it opens takes its place", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's card; wider it is a popover");
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => route.fulfill({ json: { airport: "KDLH", cycle: "261001", procedures: [] } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await openTab(page, "Nav Log");
  await expect(panel).toHaveAttribute("data-panel", "full");
  const arrive = panel.getByRole("region", { name: "KDLH · Arrive" });
  await arrive.locator("[data-testid=procedure-kind][data-kind=approach]").click({ timeout: slow(30000) });
  const menu = page.getByTestId("procedure-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-floating-card", "");
  // The route's list under it, left as it was.
  await expect(panel).toHaveAttribute("data-panel", "full");
  // Its foot opens the field's whole list, a card of its own in its place.
  await page.getByTestId("procedure-menu-all").click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toBeVisible();
  await expect(page.getByTestId("procedures-none")).toBeVisible();
  // Closed: the route's list again, the panel all the way up as it was.
  await cardClose(page, "procedures-close").click();
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toHaveCount(0);
  await expect(arrive).toBeVisible();
  await expect(panel).toHaveAttribute("data-panel", "full");
});

test("a checkpoint tapped on the chart opens its floating card; one opened over it closes back to it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's card; wider it is the chart's popup");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  // One drawn: a checkpoint whose badge would lie over a higher mark is
  // left out by MapLibre's collision until the map is closer in, and a tap
  // goes to the nearest drawn within a finger's reach (useGlSymbols).
  await tapMark(page, "route-marks", /^\d+$/);
  const head = page.locator("[data-floating-card][data-open]");
  await expect(head).toBeVisible();
  // Its name in its own head beside its close, which names the card.
  await expect(head).toContainText("nm along");
  const name = head.getByRole("heading", { level: 2 });
  await expect(name).toBeVisible();
  const named = (await name.innerText()).trim();
  const checkpoint = page.getByRole("dialog", { name: named, exact: true });
  await expect(checkpoint).toBeVisible();
  // The sheet under it left as it was.
  await expect(panel).toHaveAttribute("data-panel", "peek");
  // Not a popup over the chart.
  await expect(page.locator(".maplibregl-popup:visible")).toHaveCount(0);
  // Its ring on the map is drawn by MapLibre now (PickedGl's picked-ring
  // layers), not an SVG path a locator can count as Leaflet's was, so it
  // is left to the map's own tests.

  // The Map settings over it: its card on top, the checkpoint's kept
  // under it, and back to it as the top one is closed.
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  const map = page.getByRole("dialog", { name: "Map", exact: true });
  await expect(map).toBeVisible();
  // The last opened floats over the one under it (FloatingCard's layer),
  // so what a finger finds on the Map's card is the Map's, and the
  // checkpoint's is kept under it.
  const onTop = (region: typeof map) =>
    region.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 40, innerHeight - 4));
      return !!hit && el.contains(hit);
    });
  await expect.poll(() => onTop(map)).toBe(true);
  await expect(checkpoint).toHaveCount(1);
  // The Map's own close: the checkpoint's card under it keeps its head, and
  // its close, drawn too.
  await map.getByTestId("sheet-card-close").click();
  await expect(map).toHaveCount(0);
  await expect(checkpoint).toBeVisible();

  // A tap on the chart puts it away, as it did the popup.
  await tapTheChart(page);
  await expect(checkpoint).toHaveCount(0);
});

// The owner's iPhone, 2026-11-12: KSJT's card all the way up and a NOTAM's
// card over it, the map's buttons drawn over the airport card's NOTAM rows
// at the NOTAM card's top. The NOTAM's card floats now (the owner,
// 2026-11-13), over the airport's card and its buttons, which stay on the
// airport card's top, its size left as it was.
test("a NOTAM's card floats over the airport's, which keeps its size and the map's buttons", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's cards and their heights");
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

  // All the way up, a NOTAM's card floating over it: the buttons give way
  // with the airport's card all the way up, as they did.
  await place.getByTestId("place-notam").first().click();
  const notam = page.getByTestId("place-notam-card");
  await expect(notam).toBeVisible();
  await expect(notam).toHaveAttribute("data-floating-card", "");
  await expect(placeDrawer).toHaveAttribute("data-panel", "full");
  await expect(page.locator("body")).toHaveAttribute("data-map-panel", "full");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "0");
  await expect(radio).toHaveCSS("opacity", "0");
  // Its close back to the airport's card, still all the way up.
  await notam.getByTestId("sheet-card-close").click();
  await expect(notam).toHaveCount(0);
  await expect(place).toBeVisible();
  await expect(placeDrawer).toHaveAttribute("data-panel", "full");

  // At half, the buttons on the airport card's top and in sight, the
  // NOTAM's card floating over them; Escape back to the airport's.
  await grabberTo(page, "half");
  await place.getByTestId("place-notam").first().click();
  await expect(notam).toBeVisible();
  await expect(placeDrawer).toHaveAttribute("data-panel", "half");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(notam).toHaveCount(0);
  await expect(place).toBeVisible();
});

// The owner's iPhone, 2026-11-12: "Why are all the cards jumping like
// this?" A card opened from the chart (TFR 6/2478 over San Angelo) came in
// near the top and dropped to half, the map panned at each change and the
// map's buttons redrew on the card's top. Floating now (the owner,
// 2026-11-13), it fades up over the map where it rests, and the sheet, the
// map's buttons and the chart under it stay where they were.
test("a card tapped open on the chart floats up over it, the sheet, its buttons and the chart left where they were", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's cards and their heights");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  await expect.poll(markWith(page, "route-marks", /^\d+$/), { timeout: slow(60000) }).not.toBeNull();
  // The checkpoint highest on the screen, clear of where the card comes
  // up: one it would hide is brought out from under it (the next test).
  const tapped = (await checkpoints(page)).sort((a, b) => a.y - b.y)[0]!;
  // Every frame for a second from the tap, as painted: the sheet's top,
  // the map's buttons, and whether the chart is moving.
  const recording = page.evaluate(
    () =>
      new Promise<{ sheet: number; buttons: number | null; moving: boolean }[]>((done) => {
        const out: { sheet: number; buttons: number | null; moving: boolean }[] = [];
        const map = document.querySelector<HTMLElement>("[data-testid=gl-map]")!;
        const panel = document.querySelector('[data-slot="map-panel"]')!;
        const start = performance.now();
        const frame = () => {
          const buttons = document.querySelector("[data-map-controls]");
          out.push({
            sheet: panel.getBoundingClientRect().top,
            buttons: buttons ? buttons.getBoundingClientRect().bottom : null,
            moving: "moving" in map.dataset,
          });
          if (performance.now() - start < 1000) requestAnimationFrame(frame);
          else done(out);
        };
        requestAnimationFrame(frame);
      }),
  );
  await page.mouse.click(tapped.x, tapped.y);
  const frames = await recording;
  const card = page.locator("[data-floating-card][data-open]");
  await expect(card).toBeVisible();
  for (const f of frames) {
    expect(f.sheet).toBeCloseTo(frames[0]!.sheet, 0);
    expect(f.buttons).toBeCloseTo(frames[0]!.buttons!, 0);
    expect(f.moving).toBe(false);
  }

  // Put away, the chart stays where it is.
  const key = tapped.key;
  const at = async () => (await drawnMarks(page, "route-marks")).find((m) => m.key === key) ?? null;
  const before = (await at())!.y;
  await closeCard(page, "sheet-card-close");
  await expect(card).toHaveCount(0);
  await mapStill(page);
  expect((await at())!.y).toBeCloseTo(before, 0);
});

/** The route's numbered checkpoints drawn now, on the page's points. */
const checkpoints = async (page: Page): Promise<DrawnMark[]> =>
  (await drawnMarks(page, "route-marks")).filter((m) => /^\d+$/.test(String(m.text ?? "")));

// A floating card covers the map apart from the sheet: what it is about,
// tapped low on the screen where the card comes up, was left under it as
// the map made room for the sheet alone. The map now eases it into the
// room the card leaves, as Apple Maps keeps a place clear of its card
// (map/cardRoom's useFloatingInSight); one already in sight stays put (the
// test before).
test("a checkpoint tapped where its floating card comes up is brought out from under the card", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's floating card, at the screen's foot");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  await expect.poll(async () => (await checkpoints(page)).length, { timeout: slow(60000) }).toBeGreaterThan(0);
  // The lowest drawn, nearest the sheet: where the card comes up.
  const tapped = (await checkpoints(page)).sort((a, b) => b.y - a.y)[0]!;
  await page.mouse.click(tapped.x, tapped.y);
  const card = page.locator("[data-floating-card][data-open]");
  await expect(card).toBeVisible();
  await expect(card).toContainText("nm along");
  await mapStill(page);
  const box = (await card.boundingBox())!;
  const view = page.viewportSize()!;
  // Its point on the screen, above the card's top and below the screen's.
  const at = async () => (await checkpoints(page)).find((m) => m.key === tapped.key) ?? null;
  await expect.poll(async () => (await at())?.y ?? Infinity).toBeLessThan(box.y);
  const now = (await at())!;
  expect(now.y).toBeGreaterThan(0);
  expect(now.x).toBeGreaterThan(0);
  expect(now.x).toBeLessThan(view.width);
  const outside = now.y < box.y || now.y > box.y + box.height || now.x < box.x || now.x > box.x + box.width;
  expect(outside).toBe(true);
});
