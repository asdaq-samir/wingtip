import { test, expect } from "@playwright/test";
import { controlsInSight, openProfile, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test("plan page: Class B is always planned through, said with its clearance, with no switch", async ({ page }) => {
  // The owner (2026-11-17): no Class B setting, planned through it with the
  // clearance (14 CFR 91.131); the planner has no switch to send, and the
  // way round it is one of the Routes (route-line.spec). The planner's own
  // plan, with a Class B on the side view at its altitude.
  let asked: string | null = "unasked";
  await page.route(
    (url) => url.pathname.endsWith("/planner/navlog"),
    async (route) => {
      asked = new URL(route.request().url()).searchParams.get("class_b_clearance");
      await route.continue();
    },
  );
  await page.route(
    (url) => url.pathname.includes("/planner/route-profile"),
    async (route) => {
      const response = await route.fetch();
      const profile = await response.json();
      profile.airspace = [
        ...profile.airspace,
        { name: "CHICAGO CLASS B", class: "B", from_nm: 0, to_nm: 20, floor_ft: 0, ceiling_ft: 18000 },
      ];
      await route.fulfill({ response, json: profile });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/feet|FL/, { timeout: slow(60000) });
  expect(asked).toBeNull();
  await openProfile(page);
  await expect(page.getByTestId("class-b-accepted")).toContainText("Through Chicago Class B: clearance needed");
  await expect(page.getByTestId("avoid-class-b")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Class B/ })).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("plan page: no legal altitude's own altitude field takes a tap", async ({ page }) => {
  // Beside the airplane: a tap on the field is the field's, its keyboard
  // coming up.
  await page.route("**/api/planner/navlog**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "error",
          retry: false,
          detail: "No legal VFR cruising altitude 830-858 nm along the route",
          reasons: ["The terrain and obstacles there need 10,600 ft."],
          advice: "Route around the high ground.",
        }) + "\n",
    }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/no legal altitude/, { timeout: slow(30000) });
  const field = page.getByTestId("altitude-input");
  await expect(field).toBeVisible();
  await expect
    .poll(
      async () => {
        const box = (await field.boundingBox())!;
        return page.evaluate(
          ([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.testid ?? null,
          [box.x + box.width / 2, box.y + box.height / 2],
        );
      },
      { timeout: 5000 },
    )
    .toBe("altitude-input");
  await field.click();
  await expect(field).toBeFocused();
});

test("plan page: an altitude of the pilot's own that breaks a rule is flown as set and warned, with the rule, beside the airplane", async ({
  page,
}) => {
  // C81 to KDLH is westbound: 5,500 ft, well over 3,000 ft above the
  // ground, is an eastbound altitude (14 CFR 91.159).
  await page.goto("/app/plan?dep=C81&dest=KDLH&altitude_ft=5500");
  await settle(page);
  await controlsInSight(page);
  const chip = page.getByTestId("altitude-why");
  await expect(chip).toHaveAccessibleName(/5,500 feet.*caution/, { timeout: slow(60000) });
  await expect(page.getByTestId("route-profile-count")).toBeVisible(); // on the Profile's button (FplTabBar)
  await openProfile(page);
  const cautions = page.getByTestId("own-altitude-cautions");
  await expect(cautions).toContainText("5,500 ft C81 → KDLH");
  await expect(cautions).toContainText("flies even thousands plus 500: fly 4,500 or 6,500 ft"); // one line (b4693a549)
  await expect(cautions).toContainText("(14 CFR 91.159)");
});

test("an altitude typed is the field's at once: with no route, kept for the route to come; with one, before its log is planned again", async ({
  page,
}) => {
  // The owner's asks ("it's not letting me enter altitude if no route is
  // there"; "as soon as I enter a new altitude, it should not let me
  // wait"): the figure went blank with no route, and back to the one
  // before, "Planning altitudes…" over it, while the log was planned anew.
  test.slow();
  await page.goto("/app/plan");
  await settle(page);
  await controlsInSight(page);
  const field = page.getByTestId("altitude-input");
  await field.fill("55");
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]altitude_ft=5500/);
  await expect(field).toHaveValue("FL-055");

  // A route planned, then another altitude: the planner held three seconds
  // over it, the field at it all the while, and nothing said to wait on.
  await page.goto("/app/plan?dep=C81&dest=KDLH&altitude_ft=5500");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/5,500 feet/, { timeout: slow(60000) });
  await page.route(
    (url) => url.pathname.endsWith("/navlog") && url.searchParams.get("altitude_ft") === "7500",
    async (route) => {
      await new Promise((done) => setTimeout(done, 3000));
      await route.continue().catch(() => {});
    },
  );
  await field.fill("75");
  await field.press("Enter");
  await expect(field).toHaveValue("FL-075", { timeout: 1000 });
  await expect(page.locator("[data-slot=toast][data-type=loading]")).toHaveCount(0);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/7,500 feet/);
});

test("the altitude's figures are taken whole as it is tapped, and its Done flies what is typed", async ({ page }) => {
  // The FPL audit's A6 (2026-11-08): the caret fell between "FL" and "-",
  // and iOS's number pad has no Return, so a new altitude was a tap, three
  // deletes, three figures and a tap elsewhere.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  await controlsInSight(page);
  const input = page.getByTestId("altitude-input");
  await expect(input).toHaveValue(/^FL-\d{3}$/, { timeout: slow(60000) });
  await input.click();
  await expect
    .poll(() => input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length]))
    .toEqual([3, 6, 6]);
  await page.keyboard.type("075");
  await expect(input).toHaveValue("FL-075");
  await page.getByTestId("altitude-done").click();
  await expect(page).toHaveURL(/[?&]altitude_ft=7500(&|$)/, { timeout: slow(10000) });
  await expect(input).not.toBeFocused();
  await expect(page.getByTestId("altitude-done")).toHaveCount(0);
});
