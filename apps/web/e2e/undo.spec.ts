import { test, expect, type Page } from "@playwright/test";
import { clearTheRoute, openPanel, settle, sideDrawer, typeRoute } from "./helpers";
import { pastSettling } from "./planHelpers";
import { stopsAre } from "./stopsParam";

/**
 * Undo in place of asking first (the owner's "make the pilot aware, never
 * restrict them"): the route cleared or a stop taken out goes at once,
 * and the toast's Undo (Base UI's Toast with its action, the owner,
 * 2026-11-10) takes it back; Cmd-Z or Ctrl-Z does too, and Shift with it
 * gives the change again (hooks/planHistory).
 *
 * Only the route's own address is looked at, so the planner's answers are
 * not waited for: they are let go.
 */

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const undoToast = (page: Page, words: string) => page.locator("[data-slot=toast]").filter({ hasText: words });

test("a cleared route comes back from the toast's Undo, and again from the keyboard", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await settle(page);
  await openPanel(page);
  await pastSettling(page);

  await clearTheRoute(page);
  await expect(page).not.toHaveURL(/[?&]dep=/);
  const bar = undoToast(page, "Route Cleared");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(page).toHaveURL(stopsAre("KMSN"));
  await expect(bar).toHaveCount(0);

  // Redone and undone by the keys, away from any field.
  await page.locator("body").focus();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
});

test("a cleared route comes back from the toast's Undo, the empty route's card no Undo of its own", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await pastSettling(page);

  // No ••• in the first row before there is a route (the owner, 2026-11-18).
  await clearTheRoute(page);
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await expect(sideDrawer(page).getByTestId("route-strip").getByTestId("share-route")).toHaveCount(0);
  // No Undo beside the box's toggle (the owner, 2026-11-23: "No undo
  // needed next to toggle"): the toast's, as every edit's.
  await expect(sideDrawer(page).getByTestId("route-undo")).toHaveCount(0);
  await page.locator("[data-slot=toast]").getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);

  // Cleared again and a new route started in the field the box's toggle
  // turns the card into, focused, the toggle pressed in the same place.
  await pastSettling(page);
  await clearTheRoute(page);
  await sideDrawer(page).getByTestId("route-type-open").click();
  await expect(sideDrawer(page).getByTestId("route-type")).toBeFocused();
  await expect(sideDrawer(page).locator('[data-testid="route-type-open"][aria-pressed="true"]')).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-undo")).toHaveCount(0);
  await page.keyboard.insertText("KMSN");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&](dep|dest)=KMSN(&|$)/);
});

test("a stop taken out comes back from the Undo toast that names it", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
  await settle(page);
  await openPanel(page);
  // The route's pills, in the field the timeline's toggle turns its box into.
  await typeRoute(page);
  await pastSettling(page);

  const lines = sideDrawer(page).getByTestId("route-slide");
  await lines.getByRole("button", { name: "Stop 2 KMSN" }).focus();
  await page.keyboard.press("Delete");
  await expect(page).toHaveURL(stopsAre("KRYV"));
  const bar = undoToast(page, "KMSN Removed");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(stopsAre("KRYV,KMSN"));
  await expect(lines.getByRole("button", { name: "Stop 2 KMSN" })).toBeVisible();
});
