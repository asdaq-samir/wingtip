import { test, expect, type Page } from "@playwright/test";
import { openRoute, openTab, settle, settled, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";
import { DRAWN, LIST, unfoldProcedure } from "./procedureStubs";

// The owner's load-then-activate (2026-11-22), as a GPS navigator has it:
// an approach picked loads as a box off the route's line, Activate joins it
// to the magenta, Deactivate takes it off again, Remove takes it out with
// Undo; activated, its missed approach is suspended at the MAP until
// Unsuspend puts its legs on the line, and Suspend stops it again.

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

// KDLH's ILS 09 with its MAP at the runway and a fix of its missed approach.
const WITH_MISSED = {
  ...DRAWN,
  fixes: [
    ...DRAWN.fixes,
    { ident: "RW09", lat: 46.842, lon: -92.21, roles: ["MAP"], min_ft: null, max_ft: null, speed_kt: null, missed: false },
    { ident: "MISSA", lat: 46.843, lon: -92.17, roles: [], min_ft: 3000, max_ft: null, speed_kt: null, missed: true },
  ],
};

async function stubProcedures(page: Page) {
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/KDLH/procedures")) return route.fulfill({ json: LIST });
      if (url.pathname.endsWith("/plate")) return route.fulfill({ status: 404, json: { detail: "none" } });
      if (url.pathname.endsWith("/KDLH/procedures/I09"))
        return route.fulfill({ json: { ...WITH_MISSED, transition: url.searchParams.get("transition") } });
      return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
    },
  );
}

/** FPL's route list, its destination's region. */
async function destination(page: Page) {
  await settled(sideDrawer(page));
  await openTab(page, "Nav Log");
  await openRoute(page);
  return page.getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
}

test("an approach picked loads off the line, is activated onto it and back off, and is removed with Undo", async ({ page }) => {
  await stubProcedures(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  let kdlh = await destination(page);
  await kdlh.locator("[data-testid=procedure-kind][data-kind=approach]").click();
  const menu = page.getByTestId("procedure-menu");
  await menu.getByTestId("procedure-menu-item").filter({ hasText: "ILS" }).click();
  await page.getByTestId("procedure-menu-transition").filter({ hasText: "From DLH" }).click();
  // Loaded: in the address with its "L", a box of its fixes, none on the line.
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}L(&|$)/);
  kdlh = await destination(page);
  // Its box behind its pill on the ground, unfolded by a tap (2026-11-23).
  await unfoldProcedure(kdlh, "approach");
  const loaded = kdlh.getByTestId("approach-loaded");
  await expect(loaded).toContainText(/\bILS\b/, { timeout: slow(20000) });
  await expect(loaded).toContainText("FAKER");
  await expect(kdlh.locator("[data-testid=procedure-rows][data-kind=approach]")).toHaveCount(0);
  // Activated: on the magenta line, its fixes points of the route.
  await loaded.getByTestId("approach-activate").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(&|$)/);
  await unfoldProcedure(kdlh, "approach");
  const onLine = kdlh.locator("[data-testid=procedure-rows][data-kind=approach]");
  await expect(onLine.getByTestId("fix-branch-row").filter({ hasText: "FAKER" })).toBeVisible();
  await expect(kdlh.getByTestId("approach-loaded")).toHaveCount(0);
  // Deactivated from its menu, the "•••" at its head (2026-11-24): back off the line, dashed.
  await onLine.getByTestId("procedure-kind").first().click();
  await page.getByTestId("procedure-menu-deactivate").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}L(&|$)/);
  await unfoldProcedure(kdlh, "approach");
  await expect(kdlh.getByTestId("approach-loaded")).toBeVisible();
  // Removed, and put back by the Undo toast: from a page opened on it, as
  // edits a moment apart are one step of the plan's history (SETTLE_MS).
  await page.goto(page.url());
  await settle(page);
  kdlh = await destination(page);
  await unfoldProcedure(kdlh, "approach");
  // Taken out by its menu's No Approach, its pill on Landing's runway row (2026-11-25).
  await kdlh.locator("[data-testid=procedure-kind][data-kind=approach]").click();
  await page.getByTestId("procedure-menu-none").click();
  await expect(page).not.toHaveURL(/[?&]procs=/);
  const bar = page.locator("[data-slot=toast]").filter({ hasText: "Procedure Removed" });
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}L(&|$)/);
});

test("an activated approach is suspended at its MAP until its missed approach is unsuspended onto the line, and suspended again", async ({
  page,
}) => {
  await stubProcedures(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH&procs=KDLH:I09:DLH");
  await settle(page);
  const kdlh = await destination(page);
  // On the ground its missed approach is behind the approach's pill (2026-11-23).
  await unfoldProcedure(kdlh, "approach");
  const missed = kdlh.getByTestId("missed-approach");
  // Suspended: SUSP at the MAP, its legs dimmed in a box off the line.
  await expect(missed).toHaveAttribute("data-flown", "false", { timeout: slow(20000) });
  await expect(missed.getByTestId("missed-state")).toHaveText("SUSP at RW09");
  await expect(missed).toContainText("MISSA");
  // Unsuspended: in the address ("M"), its fixes points on the line.
  await missed.getByTestId("missed-unsuspend").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}M(&|$)/);
  await expect(missed).toHaveAttribute("data-flown", "true");
  await expect(missed.getByTestId("missed-fix-row").filter({ hasText: "MISSA" })).toBeVisible();
  // Suspended again: its fixes on a dashed line, not flown (the owner,
  // 2026-11-24: "maybe a dashed line when not activated").
  await missed.getByTestId("missed-suspend").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(&|$)/);
  await expect(missed).toHaveAttribute("data-flown", "false");
  await expect(missed.getByTestId("missed-fix-row").first().locator("[data-thread]")).toHaveAttribute("data-thread", "dashed");
});
