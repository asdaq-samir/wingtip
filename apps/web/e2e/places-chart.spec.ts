import { test, expect } from "@playwright/test";
import {
  airportMark,
  airportMarks,
  closeCard,
  consoleSheet,
  drawn,
  expectDrawerClosed,
  grabberTo,
  inSheet,
  mapStill,
  openConsole,
  openMapSettings,
  settle,
  slow,
  tapNear,
  tapTheChart,
  frontSheet,
} from "./helpers";
import { markWith } from "./marks";
import { airportToTap, card, closeInOn, withPrivateFields } from "./placeCard";
import { showPage } from "./oneSearch";

test("an airport tapped on the chart while Setup is up puts Setup away and opens its card on Airport", async ({ page }) => {
  // The owner's notice: "When selecting airport marker while being on
  // setup tab doesn't open the [airport] tab."
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "Setup leaves the chart in sight on a phone");
  await withPrivateFields(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // A route's link opens on FPL; the account button is the Search page's
  // (its toggle, PageToggle).
  await showPage(page, 0);
  await openConsole(page);
  await expect(consoleSheet(page)).toBeVisible();
  await grabberTo(page, "peek");
  const at = await airportToTap(page);
  await page.mouse.click(at.x, at.y);
  await expect(page).toHaveURL(/[?&]place=[A-Z0-9]+/);
  await expect(consoleSheet(page)).toHaveCount(0);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();
  // The account page put away for the card, the card the whole sheet; closed, the title row and its button back.
  await closeCard(page, "place-close");
  await grabberTo(page, "half");
  await expect(page.getByTestId("account-button")).toBeVisible();
});

test("a tap on an airport on the chart opens its card, a tap elsewhere puts it away, and Fly Here makes it the destination", async ({
  page,
}) => {
  await withPrivateFields(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const at = await airportToTap(page);
  await page.mouse.click(at.x, at.y);
  await expect(page).toHaveURL(/[?&]place=[A-Z0-9]+/);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();
  // Half way, as Maps opens a place.
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(card(page).getByTestId("fly-here")).toBeVisible();

  // A tap on the chart elsewhere puts it away, as in Maps, the map left at
  // the zoom the pilot put it (GlMapShell); the location arrow brings the
  // whole route back, and an airport tapped again brings a card back.
  await tapTheChart(page);
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(card(page)).toHaveCount(0);
  // A phone's sheet down to its pill, as Maps'; a desktop's side panel
  // back out as it was under the card, since it opens out (92e217114) and
  // a card's close goes back one level.
  if ((page.viewportSize()?.width ?? 0) >= 768) await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  else await expectDrawerClosed(page);
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAttribute("data-face", "route");
  await arrow.click();
  await expect(arrow).toHaveAttribute("data-face", "position");
  await mapStill(page);
  const again = await airportToTap(page);
  await page.mouse.click(again.x, again.y);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();

  // Fly Here: the field becomes the destination, from the route's
  // departure, and the card goes.
  const ident = new URL(page.url()).searchParams.get("place")!;
  await card(page).getByTestId("fly-here").click();
  await expect(page).toHaveURL(new RegExp(`[?&]dest=${ident}(&|$)`));
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(card(page)).toHaveCount(0);
});

test("the airport whose card is open wears a ring round its mark, clear of it on every side, its ident over it", async ({ page }) => {
  // C81 reporting VFR: its weather's dot on the tiles' mark.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            {
              ident: "C81",
              name: "Campbell",
              lat: 42.3246,
              lon: -88.0741,
              kind: "small",
              flight_category: "VFR",
              military: null,
              airspace_class: "G",
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // Its card at the pill's size, the chart over it in sight.
  await grabberTo(page, "peek");
  // The ring on the map's canvas, under the airports' marks and idents (its
  // layer is drawn before theirs: AirportsGl), as its probe says.
  const ring = async () => (await drawn(page, "selected-airport"))[0] as { x: number; y: number } | undefined;
  await expect.poll(async () => (await airportMark(page, "C81"))?.chip, { timeout: slow(15000) }).toBe(true);
  await expect.poll(async () => !!(await ring())).toBe(true);
  // Round the mark itself, once the map has stopped moving the two together.
  await expect(async () => {
    const r = (await ring())!;
    const c = (await airportMark(page, "C81"))!;
    const map = (await page.locator(".maplibregl-map").boundingBox())!;
    expect(Math.abs(c.x - (map.x + r.x))).toBeLessThan(1);
    expect(Math.abs(c.y - (map.y + r.y))).toBeLessThan(1);
  }).toPass({ timeout: slow(10000) });

  // Put away, the ring goes with the card.
  await closeCard(page, "place-close");
  await expect.poll(async () => !!(await ring())).toBe(false);
});

test("the chart's airports wear their weather's dot, from the METARs of the fields in view", async ({ page }) => {
  // The fields are the overlay tiles' (the suite's archive round Chicago);
  // their weather the planner's reporting fields in view, joined on by
  // ident (AirportsGl): Campbell VFR, Waukegan IFR.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            { ident: "C81", name: "Campbell", lat: 42.3246, lon: -88.0741, kind: "small", flight_category: "VFR", military: null },
            {
              ident: "KUGN",
              name: "Waukegan National",
              lat: 42.4222,
              lon: -87.8679,
              kind: "medium",
              flight_category: "IFR",
              military: null,
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // The disc in its METAR's colour: VFR green, IFR red (no report's
  // grey, classb.spec).
  await expect.poll(async () => (await airportMark(page, "C81"))?.weather.toLowerCase(), { timeout: slow(15000) }).toBe("#1a7f37");
  await expect.poll(async () => (await airportMark(page, "KUGN"))?.weather.toLowerCase(), { timeout: slow(15000) }).toBe("#b3261e");
  expect((await airportMark(page, "C81"))!.use).toBe("");
});

test("the map's Private setting draws the private fields, off by default and kept across a reload", async ({ page }) => {
  // The owner, 2026-10-27: "toggles to show private airports or not", and
  // "Make private airports hidden by default". Donald Alfred Gade (IL11),
  // a private field north of Campbell in the suite's overlay tiles, drawn
  // from the app's level 10 (wingtip.vector_tiles' AIRPORT_MIN_ZOOM): its
  // card's map brought in to it, round it.
  await closeInOn(page, "IL11", 10);
  // Other fields drawn round it, it not.
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(15000) }).toBeGreaterThan(0);
  expect(await airportMark(page, "IL11")).toBeFalsy();
  await openMapSettings(page);
  await expect(page.getByTestId("private-military-toggle")).toHaveAttribute("aria-pressed", "false");
  // Under the Map card's edge at half, as every card opens: pulled up to it.
  await inSheet(page, page.getByTestId("private-military-toggle"));
  await page.getByTestId("private-military-toggle").click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await airportMark(page, "IL11"))?.use, { timeout: slow(15000) }).toBe("private");
  // The airport's card kept under the settings', as it was.
  await expect(page).toHaveURL(/[?&]place=IL11/);
  // Loaded afresh: the setting kept.
  await closeInOn(page, "IL11", 10);
  await expect.poll(async () => (await airportMark(page, "IL11"))?.use, { timeout: slow(15000) }).toBe("private");
});

test("closer in, the airports that report wear their weather's colour, and a tap on one opens its card", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const chips = { count: async () => (await airportMarks(page)).filter((m) => m.chip).length };
  await expect.poll(markWith(page, "route-marks", "KDLH"), { timeout: slow(30000) }).not.toBeNull();
  // At the whole route's zoom on a phone (about 6), a few states out, only
  // the towered fields wear their marks, each in a Class B, C or D surface
  // area, where a state's worth would bury the chart; the long hard
  // runways join them at 7 (docs/design/rules.md, "What is drawn from
  // which zoom", the owner's 2026-11-21 ask). They stand side by side, no
  // mark over another, each kept 2 px from the next (glOverlays'
  // icon-padding), where before 27 px round each kept them some 80 apart
  // (Midway and Aurora are 39 apart). A mark's box is the picture's
  // 32 px (airportIcons' BOX) at no less than 0.7 of its size step
  // there, the farthest scale. Measured once they are in: the count of
  // none this asked for lost the race with their answer (CI, 2026-10-17).
  if (page.viewportSize()!.width < 768) {
    await mapStill(page);
    await expect.poll(() => chips.count(), { timeout: slow(20000) }).toBeGreaterThan(0);
    const at = (await airportMarks(page)).filter((m) => m.chip);
    expect(at.filter((m) => !["B", "C", "D"].includes(m.space)).map((m) => m.ident)).toEqual([]);
    const step: Record<string, number> = { largest: 1.5, larger: 1.2, small: 0.82 };
    const side = (m: { size: string }) => 32 * 0.7 * (step[m.size] ?? 1);
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const [a, b] = [at[i]!, at[j]!];
        const apart = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        expect(apart, `${a.ident} and ${b.ident} apart`).toBeGreaterThanOrEqual((side(a) + side(b)) / 2 + 4);
      }
    }
  }

  // In on the departure, a notch at a time with the map still between
  // them, as tapTheChart waits: turned while the route was still being
  // fitted, a wheel's zoom can be undone by the fit. On a loaded machine
  // the chips never came, three runs of 2026-10-09.
  const departure = markWith(page, "route-marks", "C81");
  for (let notch = 0; notch < 3; notch++) {
    await mapStill(page);
    const at = (await departure())!;
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -60);
  }
  await mapStill(page);
  await expect.poll(() => chips.count(), { timeout: slow(20000) }).toBeGreaterThan(0);
  // The route's own airports keep their own chips: none drawn twice.
  expect((await airportMarks(page)).filter((m) => m.chip && m.ident === "C81")).toHaveLength(0);

  // One whose middle nothing else covers, found and tapped again while
  // the map is still settling from the zoom (a CI runner's last frames
  // moved the chip from under the tap).
  await expect(async () => {
    const drawn = (await airportMarks(page)).filter((m) => m.chip);
    const at = await page.evaluate((marks) => {
      for (const m of marks) {
        const hit = document.elementFromPoint(m.x, m.y);
        if (hit?.matches("canvas.maplibregl-canvas")) return m;
      }
      return null;
    }, drawn);
    expect(at, "a chip with nothing over it").not.toBeNull();
    await page.mouse.click(at!.x, at!.y);
    await expect(page).toHaveURL(new RegExp(`[?&]place=${at!.ident}`), { timeout: 2000 });
  }).toPass({ timeout: slow(20000) });
  await expect(card(page).getByTestId("fly-here")).toBeVisible({ timeout: slow(15000) });
});

test("a tap a little off an airport's mark opens its card, the route's own as any field of the chart's", async ({ page }) => {
  // Waukegan, a field of the chart's own (the overlay tiles), some 90
  // points from the route's departure at a card's zoom, reporting VFR. A
  // tap that near the route's own field put the card away: only the
  // chart's own were near.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            {
              ident: "KUGN",
              name: "Waukegan National",
              lat: 42.4222,
              lon: -87.8679,
              kind: "medium",
              flight_category: "VFR",
              military: null,
              airspace_class: "D",
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KUGN");
  await settle(page);
  await expect(card(page)).toBeVisible({ timeout: slow(15000) });
  // The departure's mark, the route's own, not the chart's.
  await tapNear(page, markWith(page, "route-marks", "C81"), /[?&]place=C81(&|$)/);
  await tapNear(page, () => airportMark(page, "KUGN"), /[?&]place=KUGN(&|$)/);
});
