import { expect } from "@playwright/test";
import { settle, showSearch, showTabs, sideDrawer } from "../helpers";
import type { Screen } from "./screens";

/** The one search's places (2026-11-09, where the tabs were): its own
 *  page with nothing typed, its results typed and the account button's
 *  menu; the traffic's own page went for the one search (2026-11-14). */
export const SEARCH_SCREENS: Screen[] = [
  {
    name: "one search, nothing typed",
    ready: async (page) => {
      await page.goto("/app/plan");
      await settle(page);
      await showSearch(page);
      await expect(sideDrawer(page).getByTestId("pill-section-favorites")).toBeVisible();
    },
  },
  {
    name: "one search, typed",
    ready: async (page) => {
      await page.goto("/app/plan");
      await settle(page);
      await showTabs(page);
      await page.getByTestId("search-airports").fill("osh");
      await expect(sideDrawer(page).getByTestId("search-do-nearby")).toBeVisible();
    },
  },
  {
    name: "account page",
    ready: async (page) => {
      await page.goto("/app/plan");
      await settle(page);
      await showTabs(page);
      await page.getByTestId("account-button").click();
      await expect(page.getByTestId("console-sheet")).toBeVisible();
    },
  },
];
