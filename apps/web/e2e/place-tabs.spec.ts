import { test, expect, type Locator, type Page } from "@playwright/test";
import { frontSheet, grabberTo, settle, slow } from "./helpers";
import { card } from "./placeCard";

/** The airport card after Apple Maps' place card, as the owner picked it
 *  (C1, 2026-11-14; the canvas's "Airport card after Apple Maps"): under
 *  the actions a row of facts, each a grey name over its value, then the
 *  pictures, and the tabs in a glass bar floating at the card's foot, in
 *  sight at half and all the way up, the page scrolling under it; the
 *  picked tab filled in the tint, Weather with its category's dot, Charts
 *  with its count, each named with it. A tap on a picture opens it full
 *  screen, where a pinch zooms it. */

/** KDLH's answer with the weather and the charts the test says. */
async function kdlh(page: Page, extra: object) {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: { ...(await answer.json()), weather_unavailable: false, modelled_weather: null, nearby_metar: null, taf: null, ...extra },
      });
    },
  );
}

const chart = (kind: string, name: string) => ({ kind, name, url: `https://aeronav.faa.gov/d-tpp/2611/${name}.PDF` });

const MVFR = {
  metar: {
    raw: "KDLH 141255Z 31004KT 5SM OVC018 04/01 A3001",
    flight_category: "MVFR",
    ceiling_ft: 1800,
    ceiling_unknown: false,
    visibility_sm: 5,
    wind_dir_true_deg: 310,
    wind_speed_kt: 4,
    observed_at: "2026-11-14T12:55:00Z",
  },
  // Two plates and the diagram: three charts.
  procedures: [chart("IAP", "ILS RWY 09"), chart("IAP", "RNAV (GPS) RWY 27"), chart("APD", "AD")],
  airport_diagram_url: "https://aeronav.faa.gov/d-tpp/2611/AD.PDF",
};

/** The bar sits at the foot of the part of the card in sight: its bottom
 *  within the viewport's last 60 points. */
async function atTheFoot(page: Page, bar: Locator) {
  const box = (await bar.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  expect(box.y + box.height).toBeGreaterThan(height - 60);
}

test("the facts under the actions, the pictures after, and the tabs floating at the card's foot at half and all the way up", async ({
  page,
}) => {
  await kdlh(page, MVFR);
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  const bar = card(page).getByRole("tablist");
  await expect(bar).toBeInViewport({ ratio: 1, timeout: slow(15000) });
  await expect(card(page).getByTestId("place-tab-radio")).toBeEnabled();

  // The facts, a grey name over a value each, in the card's words.
  const facts = card(page).getByTestId("place-facts");
  await expect(card(page).getByTestId("place-fact-category")).toHaveText("MVFR");
  await expect(card(page).getByTestId("place-fact-wind")).toHaveText("Wind310°T 4 kt");
  await expect(card(page).getByTestId("place-fact-longest")).toHaveText(/^Longest[\d,]+ ft$/);
  await expect(card(page).getByTestId("place-fact-elevation")).toHaveText(/^Elevation[\d,]+ ft$/);
  await expect(card(page).getByTestId("place-fact-distance")).toHaveText(/^From C81\d+ nm [NSEW]+$/);
  // T4's one-line report is gone into them.
  await expect(card(page).getByTestId("place-weather-line")).toHaveCount(0);
  // Under the actions, the pictures under them.
  const [actions, factsBox, pictures] = await Promise.all(
    [card(page).getByTestId("place-actions"), facts, card(page).getByTestId("place-pictures")].map(async (l) => (await l.boundingBox())!),
  );
  expect(factsBox.y).toBeGreaterThanOrEqual(actions.y + actions.height);
  expect(pictures.y).toBeGreaterThanOrEqual(factsBox.y + factsBox.height);

  // The bar at the foot of the half card, over the pictures.
  await atTheFoot(page, bar);
  expect((await bar.boundingBox())!.y).toBeGreaterThan(actions.y + actions.height);

  // The hints, said in the names.
  await expect(card(page).getByTestId("place-tab-weather")).toHaveAccessibleName("Weather, MVFR");
  await expect(card(page).getByTestId("place-tab-diagrams")).toHaveAccessibleName("Charts, 3");
  await expect(card(page).getByTestId("place-tab-runways")).toHaveAccessibleName("Runways");
  await expect(card(page).getByTestId("place-tab-category")).toBeVisible();
  await expect(card(page).getByTestId("place-tab-charts")).toHaveText("3");

  // The picked tab filled as Fly Here is, the look's tint; the others not.
  const fill = (testId: string) =>
    card(page)
      .getByTestId(testId)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill("place-tab-radio")).toBe(await fill("fly-here"));
  expect(await fill("place-tab-weather")).not.toBe(await fill("fly-here"));

  // 40 tall, never grown, each reaching 44 by its pseudo-element: the
  // trigger is what a tap finds 1 point over and under it (CLAUDE.md).
  for (const id of ["place-tab-radio", "place-tab-weather", "place-tab-runways", "place-tab-diagrams"]) {
    const trigger = card(page).getByTestId(id);
    const hits = await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const at = (y: number) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      };
      return { height: r.height, over: at(r.top - 1), under: at(r.bottom + 1) };
    });
    expect(hits.height, id).toBeLessThanOrEqual(40);
    expect(hits.over, `${id} over`).toBe(true);
    expect(hits.under, `${id} under`).toBe(true);
  }

  // All the way up, still at the foot; a tab picked keeps the sheet where it is.
  await grabberTo(page, "full");
  await expect(bar).toBeInViewport({ ratio: 1 });
  await atTheFoot(page, bar);
  await card(page).getByTestId("place-tab-runways").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await atTheFoot(page, bar);
  // The last row of a page clear of the bar once scrolled to its end.
  await card(page).getByTestId("place-tab-radio").click();
  const last = card(page).getByRole("tabpanel").locator("li, [data-slot=list-row]").last();
  await last.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 5000);
  await expect
    .poll(async () => {
      const [row, b] = await Promise.all([last.boundingBox(), bar.boundingBox()]);
      return row!.y + row!.height <= b!.y + 1;
    })
    .toBe(true);
});

test("with no report of its own the Weather tab has no dot and the facts no weather", async ({ page }) => {
  await kdlh(page, { metar: null, procedures: [], airport_diagram_url: null });
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(card(page).getByTestId("place-tab-radio")).toBeEnabled({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-tab-weather")).toHaveAccessibleName("Weather");
  await expect(card(page).getByTestId("place-tab-diagrams")).toHaveAccessibleName("Charts");
  await expect(card(page).getByTestId("place-tab-category")).toHaveCount(0);
  await expect(card(page).getByTestId("place-tab-charts")).toHaveCount(0);
  await expect(card(page).getByTestId("place-fact-weather")).toHaveCount(0);
  await expect(card(page).getByTestId("place-fact-wind")).toHaveCount(0);
  await expect(card(page).getByTestId("place-fact-elevation")).toBeVisible();
});

/** A two-finger pinch out on `target`, as touch events: what MapLibre's
 *  touch zoom reads (a page's own TouchEvent with its touches set, which
 *  every engine dispatches, where `new Touch` is Chromium's alone). */
async function pinchOut(target: Locator) {
  await target.evaluate(async (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const at = (id: number, x: number) => ({
      identifier: id,
      target: el,
      clientX: x,
      clientY: cy,
      pageX: x,
      pageY: cy,
      screenX: x,
      screenY: cy,
    });
    let last: object[] = [];
    const fire = (type: string, touches: object[]) => {
      const event = new UIEvent(type, { bubbles: true, cancelable: true });
      const list = (a: object[]) => Object.assign([...a], { item: (i: number) => a[i] ?? null });
      Object.defineProperty(event, "touches", { value: list(touches) });
      Object.defineProperty(event, "targetTouches", { value: list(touches) });
      Object.defineProperty(event, "changedTouches", { value: list(type === "touchend" ? last : touches) });
      last = touches;
      el.dispatchEvent(event);
    };
    let half = 20;
    fire("touchstart", [at(1, cx - half), at(2, cx + half)]);
    for (let i = 0; i < 12; i++) {
      half += 12;
      await new Promise((done) => setTimeout(done, 16));
      fire("touchmove", [at(1, cx - half), at(2, cx + half)]);
    }
    fire("touchend", []);
  });
}

test("each picture opens full screen, where a pinch zooms it and the zoom stays, and its close goes back to the card", async ({ page }) => {
  // The owner, 2026-11-14: "When I tap on an image, why doesn't it let me
  // zoom in/out?" -- the viewer's map was laid out again at each draw of the
  // card (a new list of pages each time), the pinch lost within the minute.
  test.slow(); // a minute's wait, for the card's minute clock to draw it again
  await kdlh(page, MVFR);
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH/photos"),
    (route) => route.fulfill({ json: { aerial_url: "/api/planner/airport-aerial/KDLH.jpg", photo: null } }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(card(page).getByTestId("fly-here")).toBeEnabled({ timeout: slow(15000) });
  const viewer = page.getByTestId("airport-diagram-viewer");
  for (const tile of ["place-aerial-open", "place-diagram-open"]) {
    await card(page).getByTestId(tile).click();
    await expect(viewer).toBeVisible();
    // The whole screen, over the card.
    const box = (await viewer.boundingBox())!;
    expect(box.width).toBe(page.viewportSize()!.width);
    const canvas = viewer.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: slow(15000) });
    await page.waitForTimeout(1500); // its picture drawn
    const whole = await canvas.screenshot();
    await pinchOut(canvas);
    await page.waitForTimeout(800);
    const zoomed = await canvas.screenshot();
    expect(zoomed.equals(whole), `${tile} zoomed`).toBe(false);
    // A minute on, the card drawn again under it (its minute clock): still zoomed.
    await page.waitForTimeout(61_000);
    expect((await canvas.screenshot()).equals(zoomed), `${tile} kept`).toBe(true);
    await page.getByTestId("airport-diagram-close").click();
    await expect(viewer).toHaveCount(0);
    await expect(card(page).getByTestId("place-pictures")).toBeVisible();
  }
});
