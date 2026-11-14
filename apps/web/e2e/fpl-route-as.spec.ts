import { test, expect } from "@playwright/test";
import { controlsInSight, openMapSettings, openPanel, settle, sideDrawer } from "./helpers";
import { fromRest } from "./startState";

/** How FPL shows its route, picked from the route's ••• menu (moved out of
 *  layout.spec.ts, which is about where things land, not what a menu does). */
test.describe("/app/plan", () => {
  // How FPL shows its route is the route's ••• menu's Show Route As, the
  // checkmark on the one in use, in each of the three (the owner,
  // 2026-11-13: "I want to move fpl layout to the fpl page"); Setup's
  // Layout has no FPL tile now.
  test("the route's ••• menu shows the route as its box, one line or the cards, from each of them, and with no route", async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await fromRest(page);
    const showAs = async (as: "box" | "folded" | "plan") => {
      await controlsInSight(page);
      await sideDrawer(page).getByTestId("share-route").click();
      await expect(page.getByText("Show Route As")).toBeVisible();
      await page.getByTestId(`route-edit-${as}`).click();
      await sideDrawer(page).getByTestId("share-route").click();
      await expect(page.getByTestId(`route-edit-${as}`)).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
    };
    await openPanel(page);
    await showAs("folded");
    await expect(sideDrawer(page).getByTestId("route-folded")).toBeVisible();
    await expect(sideDrawer(page).getByTestId("route-group")).toHaveCount(0);
    await showAs("plan");
    await expect(sideDrawer(page).getByTestId("route-group")).toBeVisible();
    await showAs("box");
    await expect(sideDrawer(page).getByTestId("route-folded")).toHaveCount(0);

    await openMapSettings(page);
    await expect(page.getByTestId("map-look").getByTestId("brand-select")).toBeVisible();
    await expect(page.getByTestId("route-edit-select")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Before there is a route, too: the menu holds Show Route As alone.
    await page.goto("/app/plan");
    await settle(page);
    await openPanel(page);
    await controlsInSight(page);
    await sideDrawer(page).getByTestId("share-route").click();
    await expect(page.getByTestId("route-edit-box")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("route-clear")).toHaveCount(0);
    await expect(page.getByTestId("file-flight-plan")).toHaveCount(0);
  });
});
