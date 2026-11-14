import { test, expect } from "@playwright/test";
import { mapStill, settle, settled, sideDrawer } from "./helpers";

// A route's handler still running as the test ends found the page closed
// and failed the test (devconsole.spec): taken off, errors let go.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/**
 * A TFR's card, opened by a tap inside it on the chart (TfrGl, TfrCard).
 * The owner's iPhone, 2026-11-14, TFR 6/4116 near Grand Forks: a red
 * badge before its name pushed the name off the line's centre, its rule
 * read "special security instructions (99.7)" in grey under the rows, and
 * its times "Sun 1 Nov 01:00 – Sun 14 Mar 00:59" had no zone and no year.
 */
test("a TFR's card has every card's head, its rule as the regulation and its times with their zone and year", async ({ page }) => {
  // One security TFR over the whole country, so a tap anywhere on the
  // chart's open ground is inside it; into next year, as 6/4116 runs.
  await page.route(
    (url) => url.pathname.endsWith("/tfrs"),
    (route) =>
      route.fulfill({
        json: {
          tfrs: [
            {
              notam_id: "6/4116",
              title: "GRAND FORKS, ND",
              kind: "Security",
              effective: "2026-11-01T07:00:00Z",
              expires: "2027-03-14T06:59:00Z",
              rule: "special security instructions (99.7)",
              purpose: null,
              floor_ft: 0,
              floor_ref: "MSL",
              ceiling_ft: 18000,
              ceiling_ref: "MSL",
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [-130, 20],
                      [-60, 20],
                      [-60, 55],
                      [-130, 55],
                      [-130, 20],
                    ],
                  ],
                ],
              },
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan");
  await settle(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  // Open chart above the sheet, clear of the map's buttons at its sides.
  const map = (await page.getByTestId("gl-map").first().boundingBox())!;
  await page.mouse.click(map.x + map.width * 0.4, map.y + Math.min(map.height * 0.25, 200));

  const card = page.getByTestId("tfr-card");
  await expect(card).toBeVisible();
  const head = page.locator("[data-sheet-head]").filter({ visible: true }).last();
  // Its name centred across the card, Share at the start, ✕ at the end, and
  // no badge before the name.
  const name = head.getByRole("heading", { name: "TFR 6/4116" });
  const [box, named] = await Promise.all([head.boundingBox(), name.boundingBox()]);
  expect(Math.abs(named!.x + named!.width / 2 - (box!.x + box!.width / 2)), "centred").toBeLessThan(2);
  await expect(head.locator("[data-slot=head-start]").getByTestId("card-share")).toBeVisible();
  await expect(head.locator("[data-slot=head-end] button")).toHaveCount(1);
  await expect(head.locator("svg.lucide-ban")).toHaveCount(0);

  // The rule in words with its section, a row like the rest (14 CFR 99.7).
  await expect(card.getByTestId("tfr-purpose")).toHaveText("Special security instructions, 14 CFR 99.7");
  // Each end with its zone and UTC beside it, and the year, as it ends next year.
  const times = card.getByTestId("tfr-times");
  await expect(times).toContainText("(0700Z)");
  await expect(times).toContainText("(0659Z)");
  await expect(times).toContainText("2027");
});
