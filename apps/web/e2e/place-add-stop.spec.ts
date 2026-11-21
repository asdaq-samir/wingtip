import { test, expect } from "@playwright/test";
import { inSheet, openPanel, settle, sideDrawer, slow } from "./helpers";

/**
 * An airport already on the route has no Add Stop on its card: its row
 * ends with Address instead (the owner, 2026-11-20: "If add stop is
 * disabled, just show the address at the end instead", where 2026-11-11
 * had it greyed). A field off the route can be added.
 */
test("an airport already on the route ends its card's row with Address, not a greyed Add Stop", async ({ page }) => {
  await page.goto("/app/plan?dep=KMSN&dest=KOSH&place=KOSH");
  await settle(page);
  const row = sideDrawer(page).getByTestId("place-card").getByTestId("place-actions");
  await expect(row.getByTestId("place-address-action")).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTestId("place-add-stop")).toHaveCount(0);
  await expect(row.locator("[data-testid]").filter({ visible: true })).toHaveCount(4);
  await expect(row.locator("[data-testid]").last()).toHaveAttribute("data-testid", "place-address-action");
});

test("Add Stop takes a tap for an airport off the route", async ({ page }) => {
  await page.goto("/app/plan?dep=KMSN&dest=KOSH&place=KJVL");
  await settle(page);
  const addStop = sideDrawer(page).getByTestId("place-card").getByTestId("place-add-stop");
  await expect(addStop).toBeEnabled({ timeout: 20_000 });
});

test("an airport opened while a stop is asked for has Add Stop in Fly Here's place and Address last", async ({ page }) => {
  // The owner, 2026-11-18: "when tapping add stop, and the card opens,
  // replace fly here with add stop. And at the add fourth button for address".
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  // The timeline's last row, under FPL's floating bar at half with the
  // fields open: the sheet raised to it, as a finger does.
  const addStop = sideDrawer(page).getByTestId("timeline-add-stop");
  await inSheet(page, addStop);
  await addStop.click();
  await expect(page.getByTestId("search-airports")).toBeFocused({ timeout: slow(10_000) });
  // A field off the route opened from the search's page (Nearest), not picked from a row.
  const field = sideDrawer(page)
    .getByTestId("nearest-strip-field")
    .filter({ hasNotText: /C81|KDLH/ })
    .first();
  await field.click({ timeout: slow(20_000) });
  const card = sideDrawer(page).getByTestId("place-card");
  const row = card.getByTestId("place-actions");
  await expect(row.getByTestId("place-add-stop")).toBeEnabled({ timeout: slow(20_000) });
  await expect(row.getByTestId("fly-here")).toHaveCount(0);
  await expect(row.locator("[data-testid]").filter({ visible: true })).toHaveCount(4);
  await expect(row.locator("[data-testid]").first()).toHaveAttribute("data-testid", "place-add-stop");
  await expect(row.locator("[data-testid]").last()).toHaveAttribute("data-testid", "place-address-action");
  await row.getByTestId("place-add-stop").click();
  await expect(page).toHaveURL(/[?&]stops=/, { timeout: slow(15_000) });
  await expect(page).toHaveURL(/dest=KDLH/);
});

test("the longest runway carries a badge in the Runways tab, not a row of Details", async ({ page }) => {
  // The owner, 2026-11-11: "just put a longest badge on the runway in runway tab".
  await page.goto("/app/plan?place=KOSH");
  await settle(page);
  const card = sideDrawer(page).getByTestId("place-card");
  await card.getByTestId("place-tab-runways").click({ timeout: 20_000 });
  await expect(card.getByTestId("runway-longest")).toHaveCount(1);
  await expect(
    card
      .getByTestId("place-runways")
      .locator("li, [role=row], a, div")
      .filter({ has: page.getByTestId("runway-longest") })
      .first(),
  ).toContainText("18/36");
  await card.getByTestId("place-tab-radio").click();
  await expect(card.getByTestId("place-longest-runway")).toHaveCount(0);
});
