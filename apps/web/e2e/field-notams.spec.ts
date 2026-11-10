import { test, expect } from "@playwright/test";
import { settle, sideDrawer } from "./helpers";

const card = (page: import("@playwright/test").Page) => sideDrawer(page).getByTestId("place-card");

/**
 * An airport card's own NOTAMs (the planner's GET /api/airport/{ident}/notams,
 * as the phones' cards read them): a closure or a TFR near the field leads
 * the card, a tap shows it among the card's NOTAMs, each NOTAM's words
 * first and its text as sent folded beneath. And how far the field is from
 * the departure typed alone, before any route is planned.
 */
test("a field's closure leads its card, and its NOTAMs keep their text as sent", async ({ page }) => {
  const raw = "!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432";
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
              id: "11/042",
              kind: "notam",
              closed: true,
              raw,
              rank: 1,
              score: 90,
              top: true,
              tied: false,
              in_force: true,
              starts: "2026-11-10T12:00:00Z",
              ends: "2026-11-12T14:32:00Z",
              reasons: [],
              runways: ["09/27"],
              field: "KDLH",
              keyword: "RWY",
              role: null,
              low_ft: null,
              high_ft: null,
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan?dep=C81&place=KDLH");
  await settle(page);
  // Measured from the departure typed alone, no route yet.
  await expect(card(page).getByTestId("place-line")).toHaveText(/\d+ nm [NESW]+ of C81/);
  const alert = card(page).getByTestId("place-alert");
  await expect(alert).toHaveCount(1);
  await alert.click();
  const notams = card(page).getByTestId("place-notams");
  await expect(notams).toBeVisible();
  const one = notams.getByTestId("place-notam");
  await expect(one).toContainText("In effect now, until Nov 12 1432Z");
  await one.getByRole("button", { name: "As Sent" }).click();
  await expect(one.locator("pre")).toHaveText(raw);
});
