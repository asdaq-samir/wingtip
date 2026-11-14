import { test, expect } from "@playwright/test";
import { inSheet, settle, sideDrawer } from "./helpers";

const card = (page: import("@playwright/test").Page) => sideDrawer(page).getByTestId("place-card");

/**
 * An airport card's own NOTAMs (the planner's GET /api/airport/{ident}/notams,
 * as the phones' cards read them): a closed runway has "Closed" by its name
 * on the Runways tab, no card of alerts leads the card, and a tap on the
 * runway's row opens that NOTAM in full (the owner, 2026-11-11: "just put
 * closed badge next to the runway", "tapping the affected thing should show
 * the notam"); the Info tab's list reads it too, its words first and its
 * text as sent folded beneath, its times in the field's own time with UTC
 * beside them (the owner, 2026-11-12). And how far the field is from the
 * departure typed alone, before any route is planned.
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
          // Duluth's zone, the planner's (wingtip.time_zone).
          time_zone: "America/Chicago",
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
  await expect(card(page).getByTestId("place-fact-distance")).toHaveText(/^From C81\d+ nm$/);
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
  // The engine's reading in our words, a line each (the owner,
  // 2026-11-11: "title(what), when, where ... on different lines"): what
  // with its Active badge, its start and end in the field's own time with
  // UTC beside them (JO 7930.2 3-3-2: a NOTAM's times are UTC), and where.
  await expect(one.getByTestId("place-notam-state")).toHaveText("Active");
  await expect(one.getByTestId("place-notam-heading")).toHaveText("Runway 09/27 closed");
  // Labelled as ForeFlight's list: since its start, its end and how long is left.
  // Duluth keeps Central Standard Time in November, UTC-6, whatever the
  // device's own zone.
  await expect(one.getByTestId("place-notam-when")).toHaveText(/^Since11\/10 06:00 \(1200Z\)Ends11\/12 08:32 local \(1432Z\)/);
  await expect(one.getByTestId("place-notam-condition")).toHaveText("closed");
  // No where for a runway's: its what names it (the owner, 2026-11-11).
  await expect(one.getByTestId("place-notam-where")).toHaveCount(0);
  // Said in our words, its own words are left to its full card.
  await expect(one.getByTestId("place-notam-words")).toHaveCount(0);
  // A tap opens it in full on a card of its own: its times said once, on
  // its Since and Ends lines (the owner, 2026-11-12: "dates are twice"),
  // and as sent.
  // The card opens half way (e7bb15ec8): a row under its edge is reached by
  // pulling it up, as a finger would (inSheet), not by a click through it.
  await inSheet(page, one);
  await one.click();
  const full = page.getByTestId("place-notam-full");
  await expect(full).not.toContainText("In effect now");
  const sent = full.getByRole("button", { name: "As Sent" });
  await inSheet(page, sent);
  await sent.click();
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
 * shows three, and its title, "NOTAMs ›", opens every one in place and
 * closes them again, as every section does (the owner, 2026-11-11:
 * "Notams should open like other sections. Also how do you go back to
 * shorter list once it's expanded?").
 */
test("a field's NOTAMs show three, and their title opens every one in place and closes them", async ({ page }) => {
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
  const rows = section.getByTestId("place-notam");
  await expect(rows.first().getByTestId("place-notam-heading")).toHaveText("Runway 27 PAPI out of service");
  await expect(rows.nth(1).getByTestId("place-notam-heading")).toHaveText("Taxiway A closed between taxiway B and taxiway C");
  // Its height is where it is, not part of its what (the owner, 2026-11-11).
  await expect(rows.nth(2).getByTestId("place-notam-heading")).toHaveText("Crane");
  await expect(rows.nth(2).getByTestId("place-notam-where")).toHaveText(
    "1.2 nm southeast of the field, 1,600 ft MSL (210 ft above ground)",
  );
  await expect(section).toContainText("5");

  const title = section.getByTestId("place-notams-first-more");
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await inSheet(page, title);
  await title.click();
  await expect(title).toHaveAttribute("aria-expanded", "true");
  const all = section;
  await expect(all.getByTestId("place-notam")).toHaveCount(5);
  await expect(all.getByTestId("place-notam").nth(3).getByTestId("place-notam-heading")).toHaveText("100LL fuel not available");
  // The glide slope out: a localizer approach (AIM 1-1-9).
  await expect(all.getByTestId("place-notam").nth(4).getByTestId("place-notam-heading")).toHaveText("Glide slope runway 09 out of service");
  // Its title again: back to three.
  await inSheet(page, title);
  await title.click();
  await expect(section.getByTestId("place-notam")).toHaveCount(3);
  await expect(section).toContainText("3 of 5");
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
  await expect(card(page).getByTestId("place-notams").getByTestId("place-notam-heading").first()).toHaveText(
    "Taxiway A closed between runway 09 and taxiway C",
  );
});

/**
 * A TFR near the field says what it is and the rule it is under, how high
 * it reaches and where it is from the field, and says "TFR" and its dates
 * once (the owner, 2026-11-12, of KSJT's card: "TFR" twice, and "dates
 * are twice once in the title and then we decode them"). Its own card has
 * its place, the FAA's instructions and whom to call, the telephone a
 * link the phone dials, and its NOTAM as sent.
 */
test("a TFR near the field is its kind, rule, levels and place, its instructions and whom to call", async ({ page }) => {
  const text = "!FDC 6/2478 ZFW TX..AIRSPACE SAN ANGELO, TX..TEMPORARY FLIGHT RESTRICTIONS. 2611010700-2703140800";
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
              ...ranked(1, text),
              id: "6/2478",
              kind: "tfr",
              starts: "2026-11-01T07:00:00Z",
              ends: "2027-03-14T08:00:00Z",
              tfr: {
                kind: "Security",
                rule: "special security instructions (99.7)",
                title: "SAN ANGELO, TX, Sunday, November 1, 2026 through Sunday, March 14, 2027 Local",
                floor_ft: 3500,
                floor_ref: "MSL",
                ceiling_ft: 18000,
                ceiling_ref: "MSL",
                instructions: ["1. AIRCRAFT MUST BE SQUAWKING THE DISCRETE CODE AT ALL TIMES WHILE IN THE TFR."],
                text,
                facility: { name: "Fort Worth ARTCC", phone: "817-858-7503", frequency: null },
                contact: null,
                over_field: true,
                field: null,
                edge: null,
              },
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await card(page).getByRole("tab", { name: "Info" }).click();
  const one = card(page).getByTestId("place-notams").getByTestId("place-notam");
  await expect(one.getByTestId("place-notam-heading")).toHaveText("Security TFR, 14 CFR 99.7");
  await expect(one.getByTestId("place-notam-where")).toHaveText("3,500 to 18,000 ft MSL, over the field");
  await expect(one).not.toContainText("November");
  await inSheet(page, one);
  await one.click();
  const cardOf = page.getByTestId("place-notam-card");
  await expect(cardOf.getByText("Security TFR", { exact: true })).toBeVisible();
  await expect(cardOf).toContainText("NOTAM 6/2478");
  const full = page.getByTestId("place-notam-full");
  await expect(full.getByTestId("place-tfr-place")).toHaveText("San Angelo, TX");
  await expect(full.getByTestId("place-tfr-instructions")).toContainText("squawking the discrete code");
  await expect(full.getByTestId("place-tfr-facility-phone")).toHaveAttribute("href", "tel:+18178587503");
  await expect(full).not.toContainText("In effect now");
  const sent = full.getByRole("button", { name: "TFR as Sent" });
  await inSheet(page, sent);
  await sent.click();
  await expect(full.locator("pre")).toHaveText(text);
});
