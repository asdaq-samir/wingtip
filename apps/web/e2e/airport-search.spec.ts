import { test, expect, type Locator, type Page } from "@playwright/test";
import { openPanel, sideDrawer, slow, stopsAre } from "./helpers";

/**
 * The route picker's search -- the one search, scoped to the field it
 * sets (the one card rule, 2026-11-10): Enter takes a row only when the rows answer
 * what is in the box. The lookup is held, so the box runs ahead of it
 * the way it does on a slow link -- the planner's lookup, as before the
 * phone has its own copy of the search (lib/airportIndex), which these
 * keep from it: with the copy in, the rows answer the box at once
 * (places.spec).
 */

const airport = (ident: string, name: string) => ({ ident, name, municipality: null, region: "US-MN" });

/** The route's destination changed: from its pill's menu, a tap on it
 *  opening the airport's card (RouteBox). */
async function changeDestination(page: Page) {
  await page.getByLabel(/^(\S+, )?Destination$/).click({ button: "right" });
  await page.getByTestId("pill-menu-change").click();
}

async function slowSearch(page: Page, heldFor: string) {
  await page.route(
    (url) => url.pathname.endsWith("/airports/index"),
    (route) => route.fulfill({ status: 503, body: "" }),
  );
  await page.route("**/airports/search?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    if (q.toUpperCase() === heldFor) await new Promise((resolve) => setTimeout(resolve, 3000));
    const airports =
      q.toUpperCase() === "KD"
        ? [airport("KDAA", "First KD field"), airport("KDLH", "Duluth International")]
        : q.toUpperCase().startsWith("KDLH")
          ? [airport("KDLH", "Duluth International")]
          : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ airports }) });
  });
}

test(
  "Enter before the lookup has answered keeps what was typed, not the first row of an older answer",
  { tag: "@smoke" },
  async ({ page }) => {
    await slowSearch(page, "KDLH");
    await page.goto("/app/plan?dep=C81&dest=KMSP");
    await openPanel(page);
    const destination = page.getByLabel(/^(\S+, )?Destination$/);
    await changeDestination(page);
    const box = page.getByPlaceholder("Search for a destination");
    await box.fill("KD");
    await expect(page.getByRole("option", { name: /KDAA/ })).toBeVisible();

    await box.pressSequentially("LH");
    await box.press("Enter");
    await expect(destination).toContainText("KDLH");
  },
);

test("once the rows answer the box, Enter takes the highlighted row", async ({ page }) => {
  await slowSearch(page, "");
  await page.goto("/app/plan?dep=C81&dest=KMSP");
  await openPanel(page);
  const destination = page.getByLabel(/^(\S+, )?Destination$/);
  await changeDestination(page);
  const box = page.getByPlaceholder("Search for a destination");
  await box.fill("KD");
  await expect(page.getByRole("option", { name: /KDAA/ })).toBeVisible();
  await expect(page.getByRole("listbox")).not.toHaveAttribute("aria-busy", "true");

  await box.press("Enter");
  await expect(destination).toContainText("KDAA");
});

/** How a search's row is drawn: its height, its ident's weight, its two
 *  lines' sizes and the town's grey. */
const rowLook = (row: Locator) =>
  row.evaluate((el) => {
    const lines = [...el.querySelectorAll<HTMLElement>("span.block")];
    const ident = el.querySelector<HTMLElement>(".font-mono")!;
    return {
      height: Math.round(el.getBoundingClientRect().height),
      ident: getComputedStyle(ident).fontWeight,
      lines: lines.length,
      name: getComputedStyle(lines[0]!).fontSize,
      // In the grey of the surface it is on: the sheet's grey is a shade
      // darker for its glass than a menu's over the map (index.css).
      town: lines[1] ? [getComputedStyle(lines[1]).fontSize, lines[1].classList.contains("text-muted-foreground")] : null,
    };
  });

test("a stop at the route box's arrow and the route's ends are picked in the one search, scoped to them", async ({ page }, info) => {
  // One search field (the one card rule, 2026-11-10): the route box's arrow
  // between two points asks the one search for a stop there, as the
  // airport picker asks it for an end, where it opened a field of its own.
  test.skip(info.project.name !== "mobile", "judged as a phone");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await openPanel(page);
  await sideDrawer(page).getByRole("button", { name: "Add a stop between C81 and KDLH" }).click();
  const field = page.getByTestId("search-airports");
  await expect(field).toHaveAttribute("placeholder", "Search airports and waypoints");
  await expect(field).toBeFocused();
  await expect(sideDrawer(page).getByRole("search")).toHaveCount(1);
  await field.fill("madison");
  const typedRow = page.getByTestId("airport-result").filter({ hasText: "KMSN" }).first();
  await expect(typedRow).toBeVisible({ timeout: slow(10000) });
  const inSearch = await rowLook(typedRow);
  // Two lines, 52 tall at the least, as the search's every row.
  expect(inSearch.lines).toBe(2);
  expect(inSearch.height).toBeGreaterThanOrEqual(52);
  // Picked, it is the stop between the two.
  await typedRow.click();
  await expect(page).toHaveURL(stopsAre("KMSN"));
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);

  // The airport picker asks the one search itself, scoped to it (the one card rule, 2026-11-10): one field.
  await page.goto("/app/plan?dep=C81&dest=KMSP");
  await openPanel(page);
  await changeDestination(page);
  await expect(page.getByTestId("search-airports")).toHaveAttribute("placeholder", "Search for a destination");
  await expect(sideDrawer(page).getByRole("search")).toHaveCount(1);
});
