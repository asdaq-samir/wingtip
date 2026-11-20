import { expect, type Locator, type Page } from "@playwright/test";
import { frontSheet, showTabs, grabberTo, inSheet } from "./sheetHelpers";
import { showPage } from "./oneSearch";

/** The account button in sight: at the end of the search's row (the
 *  owner, 2026-11-20; OneSearchField), so on Search, with no card over the
 *  row and the field not in use (Cancel in its place). The developer's page
 *  keeps it in its own bar (no sheet-pages, so showPage leaves it). */
async function accountInSight(page: Page) {
  const account = page.getByTestId("account-button");
  if (await account.isVisible()) return;
  const cards = page.locator("[data-sheet-card][data-open]");
  for (let open = await cards.count(); open > 0; open--) {
    await cards.last().focus();
    await page.keyboard.press("Escape");
    await expect(cards).toHaveCount(open - 1);
  }
  await showPage(page, 0);
  const cancel = page.getByTestId("one-search-cancel");
  if (await cancel.isVisible()) await cancel.click();
  if (!(await account.isVisible())) await grabberTo(page, "half");
}

/** The console out, all the way up: the account button (the search's row's
 *  end) opens the account page (Setup) itself. At the pill, where the
 *  developer's page rests, the page is under the pill's edge. */
export async function openConsole(page: Page) {
  await showTabs(page);
  await accountInSight(page);
  await page.getByTestId("account-button").click();
  await expect(page.getByTestId("console-sheet")).toBeVisible(); // there before it is raised
  await expandConsole(page);
}

/** Settings, You's row, all the way out. Escape closes it. */
export async function openSetup(page: Page) {
  await openConsole(page);
  await page.getByTestId("settings-row").click();
  await expect(page.getByTestId("settings-page").first()).toBeVisible();
  await expandConsole(page);
}

/** The Map card's Look in sight. Since its Dimmer and Contrast came under its
 *  tiles (ChartLookRows, 2026-11-18) it is under the half card's edge, where
 *  its rows are not drawn for a reader or a tap: the card raised to reach it,
 *  as a finger does (inSheet). */
export async function mapLook(page: Page) {
  const look = page.getByTestId("map-look");
  await inSheet(page, look);
  return look;
}

/** A look row set from its menu: Theme, Appearance and Sunlight in the Map card's Look (LookChoice). */
export async function pickControl(page: Page, control: "theme-select" | "brand-select" | "sunlight-select", item: string) {
  await (await mapLook(page)).getByTestId(control).click();
  await page.getByTestId(item).click();
}

/** The map's settings: its button's card in the sheet (MapSettingsButton),
 *  as Apple Maps' Choose Map card is. Escape puts it away. */
export async function openMapSettings(page: Page) {
  // The map's buttons are under a phone's sheet all the way up: the pill.
  if ((page.viewportSize()?.width ?? 0) < 768 && (await frontSheet(page).getAttribute("data-panel")) === "full")
    await grabberTo(page, "peek");
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  await expect(page.getByTestId("map-settings")).toBeVisible();
}

/** The console all the way out. On a phone it is a card of its own over
 *  the map's sheet (ConsoleLayer's CardLayer, the stock Drawer's nested
 *  drawer, as every card is; the owner, 2026-11-13), opened half way as
 *  every card is: its grabber brings it all the way, as a finger's drag
 *  does. From `md` up the side panel has one height, and this does nothing. */
export async function expandConsole(page: Page) {
  if (page.viewportSize()!.width >= 768) return;
  await expect(page.getByTestId("console-sheet")).toBeVisible();
  await grabberTo(page, "full");
}

/** The console's title, a menu of roles -- Pilot, Developer for whoever
 *  may use dev mode, then Sign out for whoever is signed in -- opened,
 *  with the console out first. Nobody signed in and no dev mode, there
 *  is no menu (the title is plain), and neither item is there. Escape
 *  closes the menu; closeConsole puts the console away after it. */
export async function roleMenu(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  if (!(await sheet.isVisible())) await openConsole(page);
  await expect(sheet).toBeVisible();
  // In Pilot Details (AccountGroup), You's first row.
  await openAccount(page);
  const trigger = sheet.getByTestId("role-menu");
  // The menu comes with who is signed in, or dev mode, once known.
  await trigger.waitFor({ timeout: 3000 }).catch(() => {});
  if (await trigger.count()) {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
  }
  return { pilot: page.getByRole("menuitemradio", { name: "Pilot" }), developer: page.getByRole("menuitemradio", { name: "Developer" }) };
}

/** Escape until the console is away: a menu open in it takes the first. */
export async function closeConsole(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  await expect(async () => {
    // Escape, as a keyboard puts it away, wherever the focus is.
    if (await sheet.count()) await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10000 });
}
/** The console: a stock Sheet from the top from `md` up, a sheet up from
 *  the bottom edge on a phone (shadcn's Drawer). */
export const consoleSheet = (page: Page) => page.getByTestId("console-sheet");

/** The pilot console's Personal tab (it was Library), on one of its
 *  four pages: the tab, back to its list from a page open on it, then
 *  the page's row. */
export async function library(scope: Page | Locator, section: "Airplanes" | "Flights" | "Logbook" | "Minimums") {
  await consolePage(scope, "Account");
  const list = scope.getByTestId("library-section");
  await expect(list).toBeVisible();
  // Setup opens half way, as every card does (e7bb15ec8): a row under its
  // edge is reached by pulling it up.
  const row = list.getByRole("button", { name: new RegExp(`^${section}`) });
  await inSheet("page" in scope ? scope.page() : scope, row); // Setup opens half way
  await row.click();
}

/** The console's Personal tab, where who is signed in and the mode are
 *  (AccountMenu), at the owner's ask: they were the console's title row. */
export async function openAccount(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  await consolePage(sheet, "Account");
  // Pilot Details, where the role's menu is (AccountGroup; the You card,
  // 2026-11-13), once the sign-in is known: greyed signed out with no dev
  // mode, You's own head then the way in (its Sign In).
  await expect(sheet.getByText("Checking your sign-in…")).toHaveCount(0);
  // You's avatar and name (pilot-row), there signed in or in dev mode.
  const row = sheet.getByTestId("pilot-row");
  if (await row.count()) await row.click();
}

/** One of the console's places by name: the developer's console's tab of
 *  that name; the pilot's console is You, Account the page itself, Guide,
 *  About and Status rows of Settings' Help & About (the owner, 2026-11-13). */
export async function consolePage(scope: Page | Locator, name: "Account" | "Guide" | "About" | "Status") {
  const tab = scope.getByRole("tab", { name, exact: true });
  const setup = scope.getByTestId("setup-page");
  await expect(tab.or(setup).first()).toBeVisible();
  if (await tab.count()) {
    await tab.click();
    return;
  }
  // Back to You from the pages open on it, one close at a time. A page may
  // go by itself as it is reached -- the console drawn afresh on the dev
  // page lets Pilot Details go (switch.spec) -- and its close with it: then
  // it is back already, and the loop looks again.
  const back = scope.getByRole("button", { name: /^Back to (?!the map)/ }).locator("visible=true");
  while (await back.count())
    await back
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
  if (name === "Account") return;
  for (const id of ["settings-row", "help-row", `${name.toLowerCase()}-link`]) {
    const row = scope.getByTestId(id);
    await inSheet("page" in scope ? scope.page() : scope, row);
    await row.click();
  }
}
