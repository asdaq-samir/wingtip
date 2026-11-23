import { test, expect } from "@playwright/test";
import { openPanel, settle, sideDrawer, slow, typeRoute } from "./helpers";

/**
 * The route box's pills after ForeFlight's route editor (the owner's
 * screenshot, 2026-11-23): a tap on a pill is its menu -- Info, Insert
 * Before, Insert After, Show on Map, Procedures, Remove, in that order at
 * its head -- the arrow keys go from pill to pill, and what is wrong at a
 * point is on its pill: a field NASR lists closed in red, "Closed" in its
 * name, the reason at its menu's head (decision 0043).
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
