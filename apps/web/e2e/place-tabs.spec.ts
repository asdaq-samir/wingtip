import { test, expect, type Page } from "@playwright/test";
import { frontSheet, settle, slow } from "./helpers";
import { card } from "./placeCard";

/** The airport card's tabs as the owner picked them (T4, 2026-11-14; the
 *  canvas's "Airport card tabs"): directly under the four actions, in sight
 *  at half, the picked one filled in the tint; Weather with its category's
 *  dot, Charts with its count, each named with it; the field's report in a
 *  line under them; Info's pictures under that. */

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

test("the tabs sit directly under the actions with their hints, the report in a line under them, the pictures after", async ({ page }) => {
  await kdlh(page, {
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
  });
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  const bar = card(page).getByRole("tablist");
  await expect(bar).toBeInViewport({ ratio: 1, timeout: slow(15000) });
  await expect(card(page).getByTestId("place-tab-radio")).toBeEnabled();

  // Directly under the actions, nothing between.
  const [actions, tabs] = await Promise.all([card(page).getByTestId("place-actions").boundingBox(), bar.boundingBox()]);
  expect(tabs!.y).toBeGreaterThanOrEqual(actions!.y + actions!.height);
  expect(tabs!.y - (actions!.y + actions!.height)).toBeLessThan(24);

  // The hints, said in the names.
  await expect(card(page).getByTestId("place-tab-weather")).toHaveAccessibleName("Weather, MVFR");
  await expect(card(page).getByTestId("place-tab-diagrams")).toHaveAccessibleName("Charts, 3");
  await expect(card(page).getByTestId("place-tab-runways")).toHaveAccessibleName("Runways");
  await expect(card(page).getByTestId("place-tab-category")).toBeVisible();
  await expect(card(page).getByTestId("place-tab-charts")).toHaveText("3");

  // The report's line under the tabs, the pictures under it on Info.
  const line = card(page).getByTestId("place-weather-line");
  await expect(line).toHaveText(/^MVFR\s*Ceiling 1,800 ft · 310°T 4 kt · 1255Z$/);
  const [lineBox, pictures] = await Promise.all([line.boundingBox(), card(page).getByTestId("place-pictures").boundingBox()]);
  expect(lineBox!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height);
  expect(pictures!.y).toBeGreaterThanOrEqual(lineBox!.y + lineBox!.height);

  // The picked tab filled as Fly Here is, the look's tint; the others not.
  const fill = (testId: string) =>
    card(page)
      .getByTestId(testId)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill("place-tab-radio")).toBe(await fill("fly-here"));
  expect(await fill("place-tab-weather")).not.toBe(await fill("fly-here"));

  // 36 tall, never grown, each reaching 44 by its pseudo-element: the
  // trigger is what a tap finds 3 points over and under it (CLAUDE.md).
  for (const id of ["place-tab-radio", "place-tab-weather", "place-tab-runways", "place-tab-diagrams"]) {
    const trigger = card(page).getByTestId(id);
    const hits = await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const at = (y: number) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      };
      return { height: r.height, over: at(r.top - 3), under: at(r.bottom + 3) };
    });
    expect(hits.height, id).toBeLessThanOrEqual(36);
    expect(hits.over, `${id} over`).toBe(true);
    expect(hits.under, `${id} under`).toBe(true);
  }
});

test("with no report of its own the Weather tab has no dot and the card no line", async ({ page }) => {
  await kdlh(page, { metar: null, procedures: [], airport_diagram_url: null });
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(card(page).getByTestId("place-tab-radio")).toBeEnabled({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-tab-weather")).toHaveAccessibleName("Weather");
  await expect(card(page).getByTestId("place-tab-diagrams")).toHaveAccessibleName("Charts");
  await expect(card(page).getByTestId("place-tab-category")).toHaveCount(0);
  await expect(card(page).getByTestId("place-tab-charts")).toHaveCount(0);
  await expect(card(page).getByTestId("place-weather-line")).toHaveCount(0);
});
