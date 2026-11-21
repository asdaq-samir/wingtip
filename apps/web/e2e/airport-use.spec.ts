import { test, expect, type Page } from "@playwright/test";
import { sideDrawer, slow } from "./helpers";

const card = (page: Page) => sideDrawer(page).getByTestId("place-card");

/*
 * Who may land at a field, on its card: the engine's one use line for every
 * app under the name (airport_use_words, the owner's words of 2026-11-13),
 * how far a private field's figures are to be trusted, its NOTAMs' empty
 * line, and a field NASR lists as closed labelled and never flown to.
 */
test("a military field's card says who may land there under its name, whole, not cut at an ellipsis", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KORD"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({ response: answer, json: { ...(await answer.json()), military: "military" } });
    },
  );
  await page.goto("/app/plan?place=KORD");
  const kind = card(page).getByTestId("place-kind");
  // The engine's card line, one for every app (airport_use_words, the owner's words of 2026-11-13).
  await expect(kind).toHaveText("Military: prior permission required", { timeout: slow(15000) });
  // Whole: nothing of it past its box, the name alone shrunk or cut.
  await expect(kind).toHaveJSProperty("scrollWidth", await kind.evaluate((el) => el.clientWidth));
});

test("a private field's card says permission is required, how old the owner's own figures are, and that the FAA issues it no NOTAMs", async ({
  page,
}) => {
  // IL11 as the planner sends NASR's row of cycle 2026-10-29 (APT_BASE:
  // FACILITY_USE_CODE PR, INSPECT_METHOD_CODE 2, LAST_INFO_RESPONSE
  // 2025/06/10, no NOTAM_ID, no ICAO_ID), whatever the stack's planner.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/IL11"),
    async (route) => {
      const answer = await route.fetch();
      const json = {
        ...(await answer.json()),
        private: true,
        data_source: "owner-reported",
        info_date: "2025-06-10",
        notam_id: null,
        icao_id: null,
      };
      await route.fulfill({ response: answer, json });
    },
  );
  await page.goto("/app/plan?place=IL11");
  const kind = card(page).getByTestId("place-kind");
  await expect(kind).toHaveText("Private: permission required", { timeout: slow(15000) });
  await expect(kind).toHaveJSProperty("scrollWidth", await kind.evaluate((el) => el.clientWidth));
  await expect(card(page).getByTestId("place-data-source")).toHaveText("Owner-reported, last updated Jun 2025");
  await expect(card(page).getByTestId("place-notams-none")).toHaveText("No NOTAMs are issued for this private-use field.", {
    timeout: slow(15000),
  });
});

test(
  "a field NASR lists as closed says so on its card, where a private field's line would be, and is never flown to",
  // The hard rule of decision 0043, run with the smoke set on main's push.
  { tag: "@smoke" },
  async ({ page }) => {
    // 00MO, Cooper Flying Service: ARPT_STATUS CI in cycle 2026-10-29. Never
    // offered to land at: neither flown to nor added as a stop.
    await page.goto("/app/plan?place=00MO");
    await expect(card(page).getByTestId("place-kind")).toHaveText("Closed indefinitely", { timeout: slow(15000) });
    await expect(card(page).getByTestId("fly-here")).toBeDisabled();
    // With a route, its Add Stop greyed, saying why (PlaceActions).
    await page.goto("/app/plan?dep=KMSN&dest=KOSH&place=00MO");
    await expect(card(page).getByTestId("place-kind")).toHaveText("Closed indefinitely", { timeout: slow(15000) });
    const addStop = card(page).getByTestId("place-add-stop");
    await expect(addStop).toBeDisabled();
    await expect(addStop).toHaveAccessibleName(/Closed indefinitely/);
  },
);

test("a heliport's card says Heliport beside who may land there", async ({ page }) => {
  // The planner's site_type, the engine's words for NASR's SITE_TYPE_CODE H
  // (the owner, 2026-11-18: the map draws an H, the card said nothing).
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/IL11"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({ response: answer, json: { ...(await answer.json()), private: true, site_type: "Heliport" } });
    },
  );
  await page.goto("/app/plan?place=IL11");
  await expect(card(page).getByTestId("place-kind")).toHaveText("Private: permission required", { timeout: slow(15000) });
  await expect(card(page).getByTestId("place-site")).toHaveText("Heliport");
});
