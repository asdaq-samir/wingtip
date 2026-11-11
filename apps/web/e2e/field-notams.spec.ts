import { test, expect } from "@playwright/test";
import { settle, sideDrawer } from "./helpers";

const card = (page: import("@playwright/test").Page) => sideDrawer(page).getByTestId("place-card");

/**
 * An airport card's own NOTAMs (the planner's GET /api/airport/{ident}/notams,
 * as the phones' cards read them): a closed runway has "Closed" by its name
 * on the Runways tab, no card of alerts leads the card, and a tap on the
 * runway's row opens that NOTAM in full (the owner, 2026-11-11: "just put
 * closed badge next to the runway", "tapping the affected thing should show
 * the notam"); the Info tab's list reads it too, its words first and its
 * text as sent folded beneath. And how far the field is from the departure
 * typed alone, before any route is planned.
 */
test("a field's closed runway has its badge, and its NOTAMs keep their text as sent", async ({ page }) => {
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
  await expect(card(page).getByTestId("place-distance")).toHaveText(/\d+ nm [NESW]+ of C81/);
  // No card of alerts leads the card: the badge is by the runway.
  await expect(card(page).getByTestId("place-alert")).toHaveCount(0);
  await card(page).getByRole("tab", { name: "Runways" }).click();
  const runway = card(page).getByTestId("runway-row").filter({ hasText: "Runway 09/27" });
  const badge = runway.getByTestId("notam-badge");
  await expect(badge).toHaveAttribute("data-kind", "runway");
  await expect(badge).toContainText("Closed");
  await expect(card(page).getByTestId("notam-badge")).toHaveCount(1);
  // A tap on the runway's row opens that NOTAM in full.
  await runway.click();
  const opened = page.getByTestId("place-notam-full");
  await expect(opened).toContainText("Runway 09/27 closed.");
  await page.getByTestId("place-notam-card").getByTestId("sheet-card-close").click();
  await expect(opened).toHaveCount(0);

  await card(page).getByRole("tab", { name: "Info" }).click();
  const notams = card(page).getByTestId("place-notams");
  await expect(notams).toBeVisible();
  const one = notams.getByTestId("place-notam");
  // The engine's reading: its keyword as a heading, its words written out.
  await expect(one.getByTestId("place-notam-heading")).toHaveText("Runway");
  // Its start and end at the row's top right, in UTC as the NOTAM gives them.
  await expect(one.getByTestId("place-notam-window")).toHaveText("Nov 10 1200Z– Nov 12 1432Z");
  await expect(one.getByTestId("place-notam-words")).toHaveText("Runway 09/27 closed.");
  // A tap opens it in full on a card of its own: its window, as sent.
  await one.click();
  const full = page.getByTestId("place-notam-full");
  await expect(full).toContainText("In effect now, until Nov 12 1432Z");
  await full.getByRole("button", { name: "As Sent" }).click();
  await expect(full.locator("pre")).toHaveText(raw);
});

/** A NOTAM as the planner sends it, the field's, in the engine's order. */
const ranked = (n: number, raw: string) => ({
  id: `11/${String(100 + n)}`,
  kind: "notam",
  closed: false,
  raw,
  rank: n,
  score: 100 - n,
  top: n <= 3,
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
});

/**
 * The card shows the engine's first three NOTAMs, as every list on it
 * shows three, and its title, "NOTAMs ›", opens every one on a card over
 * it with the same rows (the owner, 2026-11-11: "Can notams also show as a
 * list of three like others and can we decipher them better?").
 */
test("a field's NOTAMs show three, and their title opens every one", async ({ page }) => {
  const notams = [
    ranked(1, "!DLH 11/101 DLH RWY 27 PAPI U/S 2611101200-2611202359EST"),
    ranked(2, "!DLH 11/102 DLH TWY A BTN TWY B AND TWY C CLSD 2611101200-2611202359"),
    ranked(
      3,
      "!DLH 11/103 DLH OBST CRANE (ASN 2026-AGL-1-NRA) 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) FLAGGED AND LGTD 2611101200-2611202359",
    ),
    ranked(4, "!DLH 11/104 DLH AD AP 100LL FUEL NOT AVBL 2611101200-2611202359"),
    ranked(5, "!DLH 11/105 DLH NAV ILS RWY 09 GP U/S 2611101200-2611202359"),
  ];
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KDLH/notams",
    (route) => route.fulfill({ json: { coverage_since: "2026-11-10T06:00:00Z", top: 3, unchecked: [], notams } }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await card(page).getByRole("tab", { name: "Info" }).click();
  const section = card(page).getByTestId("place-notams");
  await expect(section.getByTestId("place-notam")).toHaveCount(3);
  await expect(section.getByTestId("place-notam-heading").first()).toHaveText("Runway");
  await expect(section.getByTestId("place-notam-words").first()).toHaveText("Runway 27 PAPI out of service.");
  await expect(section.getByTestId("place-notam-words").nth(2)).toContainText("1,600 ft MSL (210 ft above ground)");
  await expect(section).toContainText("5");

  await section.getByTestId("place-notams-first-more").click();
  const all = page.getByTestId("place-notams-all");
  await expect(all).toBeVisible();
  await expect(all.getByTestId("place-notam")).toHaveCount(5);
  await expect(all.getByTestId("place-notam-words").nth(3)).toHaveText("Airport 100LL fuel not available.");
});

/**
 * A taxiway's NOTAM names the runways it runs between (JO 7930.2 3-3-6):
 * it closes the taxiway, and no runway has a badge (the engine reads its
 * keyword, TWY, as what it is about; notam_subject).
 */
test("a taxiway closed between runways puts no badge on a runway", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KDLH/notams",
    (route) =>
      route.fulfill({
        json: {
          coverage_since: "2026-11-10T06:00:00Z",
          top: 1,
          unchecked: [],
          notams: [
            { ...ranked(1, "!DLH 11/150 DLH TWY A BTN RWY 09 AND TWY C CLSD 2611101200-2611202359"), closed: true, runways: ["09"] },
          ],
        },
      }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await card(page).getByRole("tab", { name: "Runways" }).click();
  await expect(card(page).getByTestId("runway-row").first()).toBeVisible();
  await expect(card(page).getByTestId("notam-badge")).toHaveCount(0);
  await expect(card(page).getByTestId("place-alert")).toHaveCount(0);
  // It is still in the Info tab's list.
  await card(page).getByRole("tab", { name: "Info" }).click();
  await expect(card(page).getByTestId("place-notams").getByTestId("place-notam-heading").first()).toHaveText("Taxiway");
});
