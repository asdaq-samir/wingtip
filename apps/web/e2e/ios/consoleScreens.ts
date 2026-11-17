import { expect, type Page } from "@playwright/test";
import { consolePage, openConsole, openSetup, showTabs } from "../helpers";
import type { Screen } from "./screens";

/** The developer's and the pilot's consoles and the settings, in the order the audit measures them. */
export const CONSOLE_SCREENS: Screen[] = [
  {
    name: "developer console, System tab",
    ready: async (page) => {
      await page.goto("/app/dev");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Status");
      await expect(page.getByTestId("dev-refresh")).toBeVisible();
    },
  },
  {
    name: "pilot console, Guide tab",
    ready: async (page) => {
      await page.goto("/app/plan");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Guide");
      await expect(page.getByRole("heading", { name: "Plan a flight" })).toBeVisible();
    },
  },
  {
    // Aircraft, Flights, Logbook and Minimums, one tab: its list of the
    // four, each opening its page.
    name: "pilot console, Personal tab",
    ready: async (page) => {
      await page.goto("/app/plan");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Account");
      await expect(page.getByTestId("library-section")).toBeVisible();
    },
  },
  {
    // One of them open: its way back, its title and its rows.
    name: "pilot console, Personal's Aircraft page",
    ready: async (page) => {
      await page.goto("/app/plan");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Account");
      await page
        .getByTestId("library-section")
        .getByRole("button", { name: /^Airplanes/ })
        .click();
      await expect(page.getByRole("heading", { name: "Airplanes", exact: true })).toBeVisible();
    },
  },
  // The Logbook's training pages: the Checkride page (61.109, the ACS
  // codes, the endorsements and the student's instructor) and the
  // Instructing page, where the developer, no instructor, has the form
  // for a flight instructor certificate.
  ...(
    [
      ["Checkride", "Private pilot experience"],
      ["Instructing", "Your flight instructor certificate"],
    ] as const
  ).map(([row, heading]): Screen => ({
    name: `pilot console, Logbook's ${row} page`,
    ready: async (page) => {
      await page.goto("/app/plan");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Account");
      await page
        .getByTestId("library-section")
        .getByRole("button", { name: /^Logbook/ })
        .click();
      await page.getByRole("button", { name: new RegExp(`^${row}`) }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    },
  })),
  // The Guide's Practice pages: a drill's card with its answer shown, the
  // holding page's fields and drawing, the lost-comms page's segments.
  ...(
    [
      [
        "practice, a drill card",
        "Light gun signals",
        async (page: Page) => {
          await page.getByTestId("drill-reveal").click();
          await expect(page.getByTestId("drill-knew")).toBeVisible();
        },
      ],
      [
        "practice, holding entries",
        "Holding entries",
        async (page: Page) => {
          await expect(page.getByTestId("hold-diagram")).toBeVisible();
        },
      ],
      [
        "practice, lost communications",
        "Lost communications",
        async (page: Page) => {
          await expect(page.getByTestId("lost-segment").first()).toBeVisible();
        },
      ],
    ] as const
  ).map(([name, row, open]): Screen => ({
    name,
    ready: async (page) => {
      await page.goto("/app/plan");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Guide");
      await page.getByRole("button", { name: new RegExp(`^${row}`) }).click();
      await open(page);
    },
  })),
  {
    name: "developer console, Guide tab",
    ready: async (page) => {
      await page.goto("/app/dev");
      await showTabs(page);
      await openConsole(page);
      await consolePage(page, "Guide");
      await expect(page.getByRole("heading", { name: "Train the model" })).toBeVisible();
    },
  },
  {
    name: "setup controls",
    ready: async (page) => {
      await page.goto("/app/plan");
      await openSetup(page);
      await expect(page.getByTestId("settings-page").first()).toBeVisible();
    },
  },
  {
    name: "pilot console, About tab",
    ready: async (page) => {
      await page.goto("/app/plan");
      await openSetup(page);
      await consolePage(page.getByTestId("console-sheet"), "About");
      await expect(page.getByTestId("about-build")).toBeVisible();
    },
  },
];
