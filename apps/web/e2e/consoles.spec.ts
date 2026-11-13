import { test, expect } from "@playwright/test";
import {
  closeSidebarWithTheStockKey,
  consoleSheet,
  expectDrawerClosed,
  grabberTo,
  library,
  openConsole,
  openAccount,
  openSetup,
  openSidebar,
  pickControl,
  settle,
  settled,
  showTabs,
  consolePage,
} from "./helpers";

/**
 * The consoles and the settings: fitting the screen, the pilot
 * console's account and airplanes, the header's edge, the console
 * holding still as its tabs change, and the theme.
 */

test("signed in, each console fits the screen's width: nothing but a table's own scroller runs past its edge", async ({ page }) => {
  // The address is the settings' first row, and wraps there (once
  // "Signed in as <address>" and Log out shared the tab row with the
  // developer's buttons, and on a phone ran off the right edge). Wide
  // tables scroll inside their own container, which is the one thing
  // allowed past the edge.
  for (const path of ["/app/plan", "/app/dev"]) {
    await page.goto(path);
    await openConsole(page);
    await openAccount(page);
    // Who is signed in, the role menu's title.
    await consoleSheet(page).getByTestId("role-menu").click();
    await expect(page.getByTestId("pilot-address")).toHaveText("developer@example.com");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    const past = await consoleSheet(page).evaluate((sheet) => {
      const edge = document.documentElement.clientWidth + 1;
      return [...sheet.querySelectorAll("*")]
        .filter((el) => !el.closest('[data-slot="table-container"]'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > edge;
        })
        .map((el) => (el.textContent ?? "").trim().slice(0, 40));
    });
    expect(past, `${path}: past the right edge`).toEqual([]);
  }
});

test(
  "plan page: the pilot console holds the account, airplanes and flights, and the drawer opens once it is closed",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    // Opened as the one search alone on a phone, at the owner's ask
    // (MapPanel); a desktop's side panel out from the start, the search
    // and the plan in it (the one-search design's Desktop, 2026-11-09).
    const opened = page.viewportSize()!.width < 768 ? "peek" : "half";
    await expect(page.locator('[data-slot="map-panel"]')).toHaveAttribute("data-panel", opened);
    expect(await consoleSheet(page).count()).toBe(0);

    await showTabs(page);
    await openConsole(page);
    const pilot = consoleSheet(page);
    await expect(pilot).toBeVisible();
    // You, from the account button beside the search: its own close at its top.
    await expect(pilot.getByTestId("console-close")).toBeVisible();
    // A card over the map's sheet, its nested drawer as every card is
    // (ConsoleLayer's CardLayer; the owner, 2026-11-13), not a dialog of its own.
    expect(await pilot.evaluate((el) => !!el.closest('[data-slot="map-panel"] [data-sheet-card]'))).toBe(true);
    // The role, a menu, in Pilot Details: Pilot (chosen here), Developer for
    // a developer, and Sign out last; who is signed in beside it.
    await expect(pilot).toHaveAccessibleName("Pilot");
    await openAccount(page);
    await expect(pilot.getByTestId("role-menu")).toHaveText("Pilot");
    // Who is signed in, the role menu's title.
    await pilot.getByTestId("role-menu").click();
    await expect(page.getByTestId("pilot-address")).toHaveText("developer@example.com");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await pilot.getByTestId("role-menu").click();
    await expect(page.getByRole("menuitemradio", { name: "Pilot" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemradio", { name: "Developer" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
    // One page, no tabs over it: the account first, then the rest as rows
    // (Setup, the owner's pick of the redesign).
    await expect(pilot.getByTestId("setup-page")).toBeVisible();
    await expect(pilot.getByRole("tab")).toHaveCount(0);
    // The pilot's own things in one tab, Personal (it was Library), a
    // segment each.
    await library(pilot, "Airplanes");
    await expect(pilot.getByRole("region", { name: "Airplanes", exact: true })).toBeVisible();
    await library(pilot, "Flights");
    await expect(pilot.getByRole("region", { name: "Flights", exact: true })).toBeVisible();
    // Settings the gear at You's top left, Guide and About rows of its Help & About
    // (the owner's option A, 2026-11-13).
    await consolePage(pilot, "Account");
    await pilot.getByTestId("settings-row").click();
    await pilot.getByTestId("help-row").click();
    for (const link of ["guide-link", "about-link"]) await expect(pilot.getByTestId(link)).toBeVisible();
    // The personal minimums are Personal's, with no sign-in needed.
    await library(pilot, "Minimums");
    await expect(pilot.getByTestId("minimum-ceilingFt")).toBeVisible();

    // Escape puts it away -- the search under it at the height it was, on
    // a phone -- and then Escape lowers the panel too, and its grabber opens
    // it again.
    await page.keyboard.press("Escape");
    await expect(pilot).toHaveCount(0);
    await closeSidebarWithTheStockKey(page);
    await expectDrawerClosed(page);
    await openSidebar(page);
  },
);

test("You is a card over the map's sheet as every card is: its nested drawer, half as it opens, the sheet under it left as it was", async ({
  page,
}) => {
  // The stock Drawer's nested drawer over the sheet (ConsoleLayer's
  // CardLayer; the owner, 2026-11-13: "For webapp, why don't we make
  // everything a nested drawer except the welcome one?"): the sheet's
  // sizes, half as it opens, its one head row the gear and the ✕.
  await page.goto("/app/plan");
  await settle(page);
  const panel = page.locator('[data-slot="map-panel"]');
  await grabberTo(page, "half");
  await settled(panel);
  const before = (await panel.boundingBox())!;
  await page.getByTestId("account-button").click();
  const pilot = consoleSheet(page);
  await expect(pilot.getByTestId("setup-page")).toBeVisible();
  const card = page.locator("[data-sheet-card]").filter({ has: pilot });
  await expect(card).toHaveCount(1);
  expect(await card.evaluate((el) => !!el.closest('[data-slot="map-panel"]'))).toBe(true);
  const viewport = page.viewportSize()!;
  if (viewport.width < 768) await expect(card).toHaveAttribute("data-panel", "half");
  // The sheet under it where it was.
  await expect(panel).toHaveAttribute("data-panel", "half");
  const now = (await panel.boundingBox())!;
  expect(Math.abs(now.y - before.y)).toBeLessThan(1);
  // Its one head row: the gear at the left, level with the ✕ at the right.
  const gear = (await pilot.getByTestId("settings-row").boundingBox())!;
  const close = (await pilot.getByTestId("console-close").boundingBox())!;
  expect(Math.abs(gear.y - close.y)).toBeLessThan(2);
  expect(gear.x).toBeLessThan(close.x);
  // The name large and the address smaller under it, as Apple's card
  // (the owner, 2026-11-13); an address is never the large line -- with
  // no name given it asks for one.
  const name = pilot.getByTestId("you-name");
  const address = pilot.getByTestId("you-address");
  await expect(address).toContainText("@");
  await expect(name).not.toContainText("@");
  const size = (el: typeof name) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await size(name)).toBeGreaterThan(await size(address));
  // With no name, Add Your Name opens Pilot Details and its close goes
  // back to You, as the row's does, not out of the card.
  if ((await name.textContent()) === "Add Your Name") {
    await name.click();
    await expect(pilot.getByTestId("pilot-name")).toBeVisible();
    await pilot.getByTestId("console-page-close").first().click();
    await expect(pilot.getByTestId("you-name")).toBeVisible();
  }
});

test("Setup's Appearance control is system, light, dark or dark with the chart bright, a menu of all four, and the choice survives a reload", async ({
  page,
}) => {
  await page.goto("/app/plan");
  await settle(page);
  await openSetup(page);
  const html = page.locator("html");
  const theme = page.getByTestId("setup-page").getByTestId("theme-select");
  await expect(theme).toHaveAccessibleName("Appearance: System");
  await expect(html).not.toHaveClass(/dark/); // "system", and the test browser prefers light
  await pickControl(page, "theme-select", "theme-dark");
  await expect(html).toHaveClass(/dark/);
  // The one already chosen, picked again, stays chosen: a menu of one of
  // four, not a set of toggles that can all be off.
  await pickControl(page, "theme-select", "theme-dark");
  await expect(theme).toHaveAccessibleName("Appearance: Dark");
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await openSetup(page);
  await pickControl(page, "theme-select", "theme-light");
  await expect(html).not.toHaveClass(/dark/);
});
