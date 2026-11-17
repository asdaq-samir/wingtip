import { test, expect } from "@playwright/test";
import { controlsInSight, emptyPlan, foldRoute, grabberTo, openPanel, openRoute, settle, sideDrawer, slow } from "./helpers";
import { fromRest } from "./startState";

/**
 * FPL's one layout (decision 0046, the owner's two-row timeline of
 * 2026-11-17): the route a timeline, read and edited at once with the
 * sheet where the pilot left it, the figures and the Routes' chips under
 * it. A line a point, Apple Maps' Directions' look: its mark (its menu),
 * its ident (a link to its card), its time and its grip; no city. A new
 * plan, or a route typed in, has the route's field open under it till
 * Done. Show Route As and its three layouts are gone, and the opened
 * Directions list with them.
 */
test.describe("/app/plan", () => {
  test("the route is its timeline at half, no list to open: ident, time and grip a line, the figures and the Routes under it", async ({
    page,
  }) => {
    await page.goto("/app/plan?dep=KORD&stops=KOMA&dest=KDEN");
    await settle(page);
    await fromRest(page);
    await openPanel(page);
    const drawer = sideDrawer(page);

    // The first row's fields bare, no captions (the owner, 2026-11-17: "No
    // need for airplane and cruise labels"), their names VoiceOver's.
    await expect(drawer.getByTestId("aircraft-select-caption")).toHaveCount(0);
    await expect(drawer.getByTestId("altitude-group-caption")).toHaveCount(0);
    await expect(drawer.getByTestId("aircraft-input")).toHaveAccessibleName(/^Airplane, N-number/);

    const timeline = drawer.getByTestId("route-summary");
    await expect(timeline).toBeVisible({ timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KOMA", "KDEN"], { timeout: slow(30_000) });
    // No city on a line (the owner: "We don't need to say the city name").
    await expect(timeline).not.toContainText("Chicago");
    await expect(timeline.getByTestId("timeline-line")).toHaveCount(3);
    await expect(timeline.getByTestId("route-grip")).toHaveCount(3);
    // Each line one 44-point row while folded.
    for (const line of await timeline.getByTestId("timeline-line").all()) expect((await line.boundingBox())!.height).toBeLessThan(46);
    await expect(timeline.getByTestId("timeline-add-stop")).toBeVisible();
    await expect(drawer.getByTestId("flight-line")).toBeVisible();
    await expect(drawer.getByTestId("route-group")).toContainText("Suggested routes", { timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
    await expect(drawer.getByTestId("route-summary-open")).toHaveCount(0);

    // The route's field from its ••• to type the route in, Done folding it.
    await openRoute(page);
    await expect(drawer.getByTestId("route-box")).toBeVisible();
    await expect(timeline).toBeVisible();
    await foldRoute(page);
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);

    // A line opened leaves the sheet where it is.
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await timeline.locator('[data-testid="timeline-line"][data-ident="KOMA"]').getByTestId("timeline-toggle").click();
    await expect(drawer).toHaveAttribute("data-panel", "half");

    // All the way up on a phone, the same timeline: no list of its own.
    if (test.info().project.name === "mobile") {
      await grabberTo(page, "full");
      await expect(timeline).toBeVisible();
      await expect(drawer.getByTestId("route-done")).toHaveCount(0);
      await grabberTo(page, "half");
    }

    // An ident is its airport's card.
    await timeline.getByTestId("timeline-ident").nth(1).click();
    await expect(page.getByTestId("place-card")).toBeVisible();
  });

  test("past four points the middle stops fold into one line, the next stop always shown", async ({ page }) => {
    await page.goto("/app/plan?dep=KORD&stops=KDSM,KOMA,KLNK,KGRI&dest=KDEN");
    await settle(page);
    await openPanel(page);
    const timeline = sideDrawer(page).getByTestId("route-summary");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDSM", "KDEN"], { timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-more")).toHaveText("3 more stops");
    // A tap on it shows them all.
    await timeline.getByTestId("timeline-more").click();
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDSM", "KOMA", "KLNK", "KGRI", "KDEN"]);
  });

  test('a Direct To from where the airplane is reads "My Location", its Direct to line and Cancel folded and open', async ({ page }) => {
    // The owner's iPhone, 2026-11-17: the folded line read "POS0" over
    // "Present position". One name, Apple Maps' "My Location", everywhere.
    await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KUGN&direct=KUGN&was=C81%7C%7CKUGN");
    await settle(page);
    await fromRest(page);
    await openPanel(page);
    const drawer = sideDrawer(page);
    const timeline = drawer.getByTestId("route-summary");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["My Location", "KUGN"], { timeout: slow(30_000) });
    await expect(timeline).not.toContainText("POS0");
    // The Direct to line over the figures.
    const direct = drawer.getByTestId("direct-strip");
    await expect(direct).toBeVisible();
    await expect(drawer).not.toContainText("POS0");
    // Cancel gives the route back as it was.
    await direct.getByRole("button", { name: /Cancel/ }).click();
    await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
    await expect(page).not.toHaveURL(/[?&]direct=/);
  });

  test("a new plan opens its field, its two ends' cards to fill, no Done; a route typed in keeps it till Done", async ({ page }) => {
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
    await expect(drawer.getByTestId("route-summary").getByTestId("timeline-ident")).toHaveText(["KORD", "KOMA", "KDEN"], {
      timeout: slow(30_000),
    });
    await foldRoute(page);
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);

    // The route's ••• keeps Undo and the map's choices, and no Show Route As.
    await controlsInSight(page);
    await drawer.getByTestId("share-route").locator("visible=true").first().click();
    await expect(page.getByText("On the Map")).toBeVisible();
    await expect(page.getByText("Show Route As")).toHaveCount(0);
  });
});
