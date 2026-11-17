import { test, expect } from "@playwright/test";
import { controlsInSight, emptyPlan, foldRoute, grabberTo, openPanel, settle, sideDrawer, slow } from "./helpers";
import { fromRest } from "./startState";

/**
 * FPL's one layout (the owner, 2026-11-17, decision 0046): the route folded
 * to its line to read, the figures and the Routes' chips under it; a tap on
 * the line opens it to edit, its airport cards with their roles, the
 * route's field and the figures under them; Done folds it, the sheet back
 * where it was. Labels C: "Airplane" and "Cruise" over the first row's
 * fields, each card's role over its ident, "Suggested routes" over the
 * chips. Show Route As and its three layouts are gone.
 */
test.describe("/app/plan", () => {
  test("the route folds to its line, opens to its cards at a tap, and folds again at Done", async ({ page }) => {
    await page.goto("/app/plan?dep=KORD&stops=KOMA&dest=KDEN");
    await settle(page);
    await fromRest(page);
    await openPanel(page);
    const drawer = sideDrawer(page);

    // The first row's labels, inside its fields.
    await expect(drawer.getByTestId("aircraft-select-caption")).toHaveText("Airplane");
    await expect(drawer.getByTestId("altitude-group-caption")).toHaveText("Cruise");

    // Folded: the line with both ends, the figures, the Routes under their
    // heading, and nothing else -- no cards, no field.
    const line = drawer.getByTestId("route-summary");
    await expect(line).toBeVisible({ timeout: slow(30_000) });
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(line).toContainText("KORD");
    await expect(line).toContainText("KDEN");
    await expect(line).toContainText("1 stop");
    await expect(line).toHaveAccessibleName(/^Route, KORD .* to KDEN .*1 stop: KOMA\. Edit$/);
    await expect(drawer.getByTestId("flight-line")).toBeVisible();
    await expect(drawer.getByTestId("route-group")).toContainText("Suggested routes", { timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-field")).toHaveCount(0);
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);

    // Opened: the head, the cards with their roles, the field, the figures
    // under the last card, and the chips put away. The focus on the head's
    // toggle; the sheet raised all the way up for the room.
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await line.click();
    const head = drawer.getByTestId("route-head");
    await expect(head).toHaveText("Route");
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(head).toBeFocused();
    await expect(drawer.getByTestId("route-done")).toBeVisible();
    await expect(drawer).toHaveAttribute("data-panel", "full");
    const roles = drawer.getByTestId("route-field").getByTestId("field-role");
    await expect(roles).toHaveText(["Departure", "Stop", "Destination"], { timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-box")).toBeVisible();
    const figures = drawer.getByTestId("route-editor-figures");
    await expect(figures.getByTestId("flight-line")).toBeVisible();
    const lastCard = (await drawer.getByTestId("route-field").last().boundingBox())!;
    expect((await figures.boundingBox())!.y).toBeGreaterThan(lastCard.y + lastCard.height);
    await expect(drawer.getByTestId("route-group")).toHaveCount(0);
    await expect(drawer.getByTestId("flight-line")).toHaveCount(1);

    // Done: folded, the focus back on the line, the sheet back at half.
    await foldRoute(page);
    await expect(line).toBeFocused();
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await expect(drawer.getByTestId("route-field")).toHaveCount(0);

    // By the keyboard, and "Route" folds it as Done does.
    await line.focus();
    await page.keyboard.press("Enter");
    await expect(head).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(line).toBeFocused();

    // Down at the pill it folds, and comes up folded.
    await line.click();
    await expect(drawer.getByTestId("route-done")).toBeVisible();
    await grabberTo(page, "peek");
    await grabberTo(page, "half");
    await expect(line).toBeVisible();
  });

  test("a new plan opens to edit, its two ends' cards to fill and the route's field, no Done", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await emptyPlan(page);
    const drawer = sideDrawer(page);
    await expect(drawer.getByTestId("route-head")).toHaveText("Route");
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
    const ends = drawer.getByTestId("route-ends");
    await expect(ends.getByRole("combobox", { name: "Departure" }).or(ends.getByRole("textbox", { name: "Departure" }))).toBeVisible();
    await expect(ends.getByRole("combobox", { name: "Destination" }).or(ends.getByRole("textbox", { name: "Destination" }))).toBeVisible();
    await expect(drawer.getByTestId("route-type")).toBeVisible();

    // A whole route pasted into the field keeps it open, the pilot still
    // at it, till Done folds it.
    await drawer.getByTestId("route-type").click();
    await page.keyboard.insertText("KORD KOMA KDEN");
    await page.keyboard.press("Enter");
    await expect(drawer.getByTestId("route-done")).toBeVisible({ timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-field").getByTestId("field-role")).toHaveText(["Departure", "Stop", "Destination"], {
      timeout: slow(30_000),
    });
    await foldRoute(page);

    // The route's ••• keeps Undo and the map's choices, and no Show Route As.
    await controlsInSight(page);
    await drawer.getByTestId("share-route").locator("visible=true").first().click();
    await expect(page.getByText("On the Map")).toBeVisible();
    await expect(page.getByText("Show Route As")).toHaveCount(0);
  });
});
