import { test, expect, type Page } from "@playwright/test";
import { consolePage, grabberTo, openConsole, settled, sideDrawer, slow } from "./helpers";
import { go, pick } from "./cardEntries";

/**
 * The phone's sheet in Safari's engine (the webkit-phone project, an
 * iPhone's size and touch), where the owner's iPhone found every sheet bug
 * of 2026-11-10/11 that Chromium did not: the list showing through the head
 * band, a sliver of it over the sheet's top, the airport card's pinned head
 * and tabs part way down the sheet, a card at the pill drawn empty. The
 * sheet's head is sticky in its one scroller now (SheetParts), nothing of
 * it measured, and a card is the stock Drawer's nested drawer over the
 * sheet with a scroller of its own (CardStack); this holds where the
 * browser puts them. One @smoke, run after
 * merge on main's push (tier 2: it needs the whole stack, docs/CI.md).
 */

const panel = (page: Page) => sideDrawer(page);
const top = async (page: Page) => (await panel(page).boundingBox())!.y;

/** What is drawn at (x, y): its test id and whether it is in the sheet's head band. */
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return {
        // The grabber takes a finger a little over the sheet's top
        // (SheetGrabber's 44-point hit area): its, not the sheet's drawing.
        inPanel: !!hit?.closest('[data-slot="map-panel"]') && !hit?.closest('[data-testid="sidebar-trigger-button"]'),
        inBand: !!hit?.closest("[data-head-band]"),
        inBody: !!hit?.closest("[data-panel-body]"),
        inHead: !!hit?.closest("[data-sheet-head]"),
      };
    },
    [x, y] as const,
  );

test(
  "the sheet in WebKit: its heads pinned, nothing over or through them, the radio and the map's buttons on its top, Settings at the pill",
  { tag: "@smoke" },
  async ({ page }) => {
    // The home list, all the way up and scrolled: nothing of it above the
    // sheet's top, and the head band its own all across (frosted over the list).
    await go(page, "/app/plan");
    await grabberTo(page, "full");
    await settled(panel(page));
    // Search's page, the one up with no route: each of the sheet's two pages
    // (SheetPage) has its own scroller and head band.
    const search = panel(page).locator('[data-sheet-page="0"]');
    const scroller = search.locator("[data-sheet-scroll]").first();
    await scroller.evaluate((el) => el.scrollTo({ top: 240 }));
    const band = (await search.locator("[data-head-band]").boundingBox())!;
    const width = page.viewportSize()!.width;
    for (const x of [20, width / 2, width - 20]) {
      expect((await at(page, x, (await top(page)) - 3)).inPanel, `nothing of the sheet over its top at x ${x}`).toBe(false);
      for (let y = band.y + 2; y < band.y + band.height - 1; y += 10)
        expect((await at(page, x, y)).inBody, `the list drawn through the head band at ${x},${Math.round(y)}`).toBe(false);
    }

    // The radio's button rides the sheet's top, 24 over it at the left, and
    // the map's buttons the same at the right (the owner, 2026-11-11: "just
    // above the search bar on the right"), at half and at the pill, clear
    // of each other, each tap landing on its own.
    const mic = page.getByTestId("mic-circle");
    const controls = page.locator("[data-map-controls]");
    const over = async (part: typeof mic) => {
      const b = (await part.boundingBox())!;
      return Math.round((await top(page)) - b.y - b.height);
    };
    for (const size of ["half", "peek"] as const) {
      await grabberTo(page, size);
      await settled(panel(page));
      await expect.poll(() => over(mic), { timeout: slow(5_000) }).toBe(24);
      await expect.poll(() => over(controls), { timeout: slow(5_000) }).toBe(24);
      const [m, c] = [(await mic.boundingBox())!, (await controls.boundingBox())!];
      expect(m.x + m.width, "the radio clear of the map's buttons").toBeLessThan(c.x);
      expect(width - (c.x + c.width), "the map's buttons at the right edge").toBeLessThan(20);
      for (const id of ["map-settings-button", "my-position-button"]) {
        const b = (await controls.getByTestId(id).boundingBox())!;
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid"),
          [b.x + b.width / 2, b.y + b.height / 2] as const,
        );
        expect(hit, `${id} takes its own tap`).toBe(id);
      }
    }

    // The airport card, a nested drawer of its own over the sheet: its
    // pinned head at its own scroller's top, its tabs pinned under it.
    await pick(page, "duluth", "airport");
    const card = page.getByTestId("place-card");
    await expect(card).toBeVisible({ timeout: slow(20_000) });
    await expect(panel(page)).toHaveAttribute("data-nested-drawer-open", "");
    await grabberTo(page, "full");
    await settled(panel(page));
    const cardScroller = page.locator("[data-sheet-card]").filter({ has: card }).locator("[data-sheet-scroll]");
    await cardScroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const head = card.getByTestId("card-head-pinned");
    const bar = card.getByRole("tablist");
    await expect(async () => {
      const [h, s, b] = [(await head.boundingBox())!, (await cardScroller.boundingBox())!, (await bar.boundingBox())!];
      expect(Math.abs(h.y - s.y), "the pinned head at the sheet's content top").toBeLessThanOrEqual(2);
      expect(Math.abs(b.y - (h.y + h.height)), "the tabs pinned under it").toBeLessThanOrEqual(16);
    }).toPass({ timeout: slow(5_000) });

    // At the pill the card is its title row: its name and ✕ in the pill's room.
    await grabberTo(page, "peek");
    await settled(panel(page));
    const close = page.getByTestId("place-close").filter({ visible: true }).first();
    await expect(close).toBeInViewport();
    const c = (await close.boundingBox())!;
    expect((await at(page, c.x + c.width / 2, c.y + c.height / 2)).inHead).toBe(true);

    // Settings: at the pill its title and ✕; its foot's seven links; no
    // credits row on the map; Status with the FAA data's cycles.
    await go(page, "/app/plan");
    await openConsole(page);
    await grabberTo(page, "peek");
    await settled(panel(page));
    const consoleClose = page.getByTestId("console-close");
    await expect(consoleClose).toBeInViewport();
    const k = (await consoleClose.boundingBox())!;
    expect((await at(page, k.x + k.width / 2, k.y + k.height / 2)).inHead).toBe(true);
    await grabberTo(page, "full");
    const foot = page.getByTestId("settings-foot");
    await foot.scrollIntoViewIfNeeded();
    await expect(foot.locator("button, a")).toHaveText(["Status", "Log", "Guide", "About", "Privacy", "Terms", "Legal"]);
    await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCount(0);
    await consolePage(page.getByTestId("console-sheet"), "Status");
    await expect(page.getByTestId("status-data-cycle").first()).toBeVisible({ timeout: slow(15_000) });
  },
);
