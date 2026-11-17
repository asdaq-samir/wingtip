import { test, expect } from "@playwright/test";
import { controlsInSight, emptyPlan, foldRoute, grabberTo, openPanel, settle, sideDrawer, slow } from "./helpers";
import { fromRest } from "./startState";

/**
 * FPL's one layout (the owner, 2026-11-17, decision 0046): the route folded
 * to its line to read, the figures and the Routes' chips under it; a tap on
 * the line opens it to edit, its airport cards with their roles, the
 * route's field and the figures under them; Done folds it, the sheet back
 * where it was. Labels C: each card's role over its ident, "Suggested
 * routes" over the chips; the first row's fields bare. Show Route As and
 * its three layouts are gone.
 */
test.describe("/app/plan", () => {
  test("the route folds to its line, opens to its cards at a tap, and folds again at Done", async ({ page }) => {
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

    // Folded: the timeline, one line an airport -- its ident a link, its
    // city, its time -- the figures, the Routes under their heading, and
    // nothing else: no cards, no field. The timeline one disclosure.
    const timeline = drawer.getByTestId("route-summary");
    const line = drawer.getByTestId("route-summary-open");
    await expect(timeline).toBeVisible({ timeout: slow(30_000) });
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(line).toHaveAccessibleName("Route KORD to KDEN via KOMA, open");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KOMA", "KDEN"]);
    await expect(timeline.getByTestId("timeline-name")).toContainText(["Chicago", "Omaha", "Denver"], { timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-time").first()).toHaveText("Now");
    // No words but the line's own: none ends in "…" at this size.
    for (const name of await timeline.getByTestId("timeline-name").all())
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(drawer.getByTestId("flight-line")).toBeVisible();
    await expect(drawer.getByTestId("route-group")).toContainText("Suggested routes", { timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-field")).toHaveCount(0);
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);

    // Opened: the head, the cards with their roles, the field, the figures
    // under the last card, and the chips put away. The focus on the head's
    // toggle; the sheet raised all the way up.
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await line.click();
    const head = drawer.getByTestId("route-head");
    await expect(head).toHaveText("Route");
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(head).toBeFocused();
    await expect(drawer.getByTestId("route-done")).toBeVisible();
    await expect(drawer).toHaveAttribute("data-panel", "full");
    // One grouped list, Apple Maps' Directions': each row its ident over
    // its city, a tap on it a change (its name says so), Add a Stop last.
    const idents = drawer.getByTestId("route-field").getByTestId("field-ident");
    await expect(idents).toHaveText(["KORD", "KOMA", "KDEN"], { timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-field").getByTestId("field-city")).toContainText(["Chicago", "Omaha", "Denver"]);
    await expect(drawer.getByRole("button", { name: /^Stop KOMA.*: change$/ })).toBeVisible();
    await expect(drawer.getByTestId("route-box")).toBeVisible();
    const figures = drawer.getByTestId("route-editor-figures");
    await expect(figures.getByTestId("flight-line")).toBeVisible();
    const lastCard = (await drawer.getByTestId("route-field").last().boundingBox())!;
    expect((await figures.boundingBox())!.y).toBeGreaterThan(lastCard.y + lastCard.height);
    await expect(drawer.getByTestId("route-group")).toHaveCount(0);
    await expect(drawer.getByTestId("flight-line")).toHaveCount(1);

    // Done: folded, the focus back on the timeline, the sheet back at half.
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

    // The sheet's height drives it on a phone: all the way up it opens (a
    // full sheet is never blank), back at half it folds.
    if (test.info().project.name === "mobile") {
      await grabberTo(page, "full");
      await expect(drawer.getByTestId("route-done")).toBeVisible();
      await expect(drawer.getByTestId("route-field").first()).toBeVisible();
      await grabberTo(page, "half");
      await expect(line).toBeVisible();
      await expect(drawer.getByTestId("route-field")).toHaveCount(0);
    }

    // An ident is its airport's card, not the route opened.
    await timeline.getByTestId("timeline-ident").nth(1).click();
    await expect(page.getByTestId("place-card")).toBeVisible();
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
  });

  test("past four points the middle stops fold into one line, the next stop always shown", async ({ page }) => {
    await page.goto("/app/plan?dep=KORD&stops=KDSM,KOMA,KLNK,KGRI&dest=KDEN");
    await settle(page);
    await openPanel(page);
    const timeline = sideDrawer(page).getByTestId("route-summary");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDSM", "KDEN"], { timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-more")).toHaveText("3 more stops");
    await expect(sideDrawer(page).getByTestId("route-summary-open")).toHaveAccessibleName(
      "Route KORD to KDEN via KDSM, KOMA, KLNK, KGRI, open",
    );
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
    await expect(timeline.getByTestId("timeline-line").first()).toContainText("My Location", { timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KUGN"]);
    await expect(timeline).not.toContainText("POS0");
    // The Direct to line over the figures, folded and open.
    const direct = drawer.getByTestId("direct-strip");
    await expect(direct).toBeVisible();
    await drawer.getByTestId("route-summary-open").click();
    await expect(direct).toBeVisible();
    await expect(drawer).not.toContainText("POS0");
    // Cancel gives the route back as it was.
    await direct.getByRole("button", { name: /Cancel/ }).click();
    await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
    await expect(page).not.toHaveURL(/[?&]direct=/);
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
    await expect(drawer.getByTestId("route-field").getByTestId("field-ident")).toHaveText(["KORD", "KOMA", "KDEN"], {
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
