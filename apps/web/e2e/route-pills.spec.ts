import { test, expect, type Page } from "@playwright/test";
import { openPanel, settle, sideDrawer, slow, typeRoute } from "./helpers";
import { stopsAre } from "./stopsParam";

/**
 * The route box's pills after ForeFlight's route editor (the owner's
 * screenshot, 2026-11-23): a tap on a pill is its menu -- Info, Insert
 * Before, Insert After, Show on Map, Procedures, Remove, in that order at
 * its head -- the arrow keys go from pill to pill, and what is wrong at a
 * point is on its pill: a field NASR lists closed in red, "Closed" in its
 * name, the reason at its menu's head (decision 0043). A flight's
 * suggested fuel stops are one dashed pill, "+3 fuel stops" (the owner,
 * 2026-11-23), a single one its ident (fuel-stops.spec).
 */

test("a pill's tap is its menu, Info first and Remove last; Insert After asks the one search; the arrows go pill to pill", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const dest = sideDrawer(page).getByTestId("route-dest");
  await dest.click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toHaveText("Info");
  await expect(page.getByTestId("pill-menu-add-before")).toHaveText("Insert Before");
  await expect(page.getByTestId("pill-menu-add-after")).toHaveText("Insert After");
  await expect(page.getByTestId("pill-menu-show")).toHaveText("Show on Map");
  await expect(items.last()).toHaveText("Remove");
  // Insert After the destination: the one search, its pick the new
  // destination and KDLH a stop, as Maps' Add Stop does.
  await page.getByTestId("pill-menu-add-after").click();
  await expect(page.getByTestId("search-airports")).toBeFocused();
  await page.keyboard.press("Escape");

  // From the departure's pill, the right arrow is the destination's.
  await sideDrawer(page).getByTestId("route-dep").focus();
  await page.keyboard.press("ArrowRight");
  await expect(dest).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(sideDrawer(page).getByTestId("route-dep")).toBeFocused();
});

test("a field NASR lists closed is red on its pill, Closed in its name and the reason in its menu", async ({ page }) => {
  // The engine's field_status as the planner labels the card (decision
  // 0043): KDLH's card answered as closed.
  await page.route(
    (url) => url.pathname.endsWith("/airport/KDLH"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), closed: "Closed indefinitely" } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const dest = sideDrawer(page).getByTestId("route-dest");
  await expect(dest).toHaveAccessibleName(/Destination KDLH, Closed/, { timeout: slow(15000) });
  await expect(dest).toHaveAttribute("aria-invalid", "true");
  await dest.click();
  await expect(page.getByTestId("pill-menu-note")).toHaveText("Closed indefinitely. Pick another field.");
});

/** C81-KDLH's live nav log, its last message given a flight of three
 *  suggested fuel stops: a long route's box, many dashed pills, made short. */
async function threeStops(page: Page) {
  const at = (ident: string, lat: number, lon: number) => ({ ident, name: ident, lat, lon, from_nm: 100, added_nm: 1, lands_with_gal: 18 });
  const stops = [at("KRPD", 45.419, -91.7735), at("KEAU", 44.8658, -91.4843), at("KHYR", 46.0252, -91.4443)];
  await page.route(
    (url) => url.pathname.endsWith("/navlog") && !url.searchParams.get("stops"),
    async (route) => {
      const lines = (await (await route.fetch()).text()).split("\n").filter(Boolean);
      const done = (line: string) => {
        const message = JSON.parse(line);
        if (message.type === "done")
          message.totals.fuel_stops = [{ departure: "C81", destination: "KDLH", usable_gal: 48, reason: "fuel", stops }];
        return JSON.stringify(message);
      };
      await route.fulfill({ contentType: "application/x-ndjson", body: `${lines.map(done).join("\n")}\n` });
    },
  );
}

/** The plan opened afresh, C81 to KDLH typed, the fold drawn. */
async function planned(page: Page) {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const fold = sideDrawer(page).getByTestId("route-fuel-fold");
  await expect(fold).toHaveText("+3 fuel stops", { timeout: slow(60_000) });
  return fold;
}

test("a flight's suggested fuel stops fold into one pill: its menu adds one, Delete dismisses them, Enter adds them all", async ({
  page,
}) => {
  await threeStops(page);
  let fold = await planned(page);
  await expect(fold).toHaveAccessibleName("3 suggested fuel stops, KRPD, KEAU, KHYR: add them to the route");
  // No pill of each: the fold is the flight's one.
  await expect(sideDrawer(page).getByTestId("route-fuel-stop")).toHaveCount(0);
  // Its menu lists them, each added on its own, with Add All and Dismiss All.
  await fold.click({ button: "right" });
  await expect(page.getByTestId("route-fuel-fold-stop")).toHaveText(["KRPD", "KEAU", "KHYR"]);
  await expect(page.getByTestId("route-fuel-fold-add-all")).toHaveText("Add All");
  await expect(page.getByTestId("route-fuel-fold-dismiss-all")).toHaveText("Dismiss All");
  await page.getByTestId("route-fuel-fold-stop").nth(1).click();
  await page.getByTestId("route-fuel-fold-add-one").click();
  await expect(page).toHaveURL(stopsAre("KEAU"));

  // Planned again: Delete on the fold dismisses the flight's suggestions.
  fold = await planned(page);
  await fold.focus();
  await page.keyboard.press("Delete");
  await expect(fold).toHaveCount(0);

  // And again: Enter on it puts all three in, where it was drawn.
  fold = await planned(page);
  await fold.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(stopsAre("KRPD,KEAU,KHYR"));
});
