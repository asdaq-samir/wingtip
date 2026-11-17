import { test, expect } from "@playwright/test";
import { closeCard, controlsInSight, openProfile, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test("plan page: Class B is planned through by default, said with its clearance, and Avoid Class B puts the waypoint round it in the stops", async ({
  page,
}) => {
  // The owner's pick (2026-10-20): Class B accepted unless avoided. The
  // planner's own plan, with a Class B on the side view at its altitude
  // and the waypoint round it (BEPKE, 6 nm further) put in its answer.
  let asked = "";
  await page.route(
    (url) => url.pathname.endsWith("/planner/navlog"),
    async (route) => {
      asked = new URL(route.request().url()).searchParams.get("class_b_clearance") ?? "";
      const response = await route.fetch();
      const body = (await response.text())
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const message = JSON.parse(line);
          if (message.type === "altitude")
            message.class_b_detours = [{ ident: "BEPKE", kind: "GPS waypoint", added_nm: 5.9, stop_index: 0 }];
          return JSON.stringify(message);
        })
        .join("\n");
      await route.fulfill({ response, body });
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
  expect(asked).toBe("true");
  await openProfile(page);
  const accepted = page.getByTestId("class-b-accepted");
  await expect(accepted).toContainText("Through Chicago Class B: clearance needed");
  await page.getByTestId("avoid-class-b").click();
  await expect(page).toHaveURL(/[?&]class_b=0/);
  await expect(page).toHaveURL(/[?&]stops=BEPKE/);
  // Avoided, and allowed again from the same card, which stays open.
  await page.getByTestId("class-b-avoided").getByRole("button", { name: "Allow Class B" }).click();
  await expect(page).not.toHaveURL(/class_b=/);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("plan page: Class B avoided with no legal altitude offers the waypoint round it, or allowing the Class B", async ({ page }) => {
  // Midway to Duluth runs over O'Hare, where the Chicago Class B reaches
  // the ground: avoided (class_b=0), the planner names a waypoint round it.
  await page.route("**/api/planner/navlog**", (route) => {
    if (new URL(route.request().url()).searchParams.get("class_b_clearance") === "true") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "error",
          retry: false,
          detail: "No legal VFR cruising altitude 1-15 nm along the route",
          reasons: ["The Chicago Class B reaches the ground there; going through it needs a clearance."],
          advice: "Fly via BEPKE (6 nm further) to stay out of it, or plan it with a Class B clearance.",
          class_b: true,
          detours: [{ ident: "BEPKE", kind: "GPS waypoint", added_nm: 5.9, stop_index: 0 }],
        }) + "\n",
    });
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH&class_b=0");
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/no legal altitude/, { timeout: slow(30000) });
  const problem = page.getByTestId("route-problem");
  await openProfile(page);
  await expect(problem.getByRole("listitem")).toHaveText([
    "The Chicago Class B reaches the ground there; going through it needs a clearance.",
  ]);
  // The two ways past it, and no altitude of the pilot's own: under a
  // Class B to the ground there is none.
  await expect(problem.getByTestId("unflyable-fly-via")).toBeVisible();
  // The card put away, the field beside the airplane still takes a figure,
  // at the owner's ask ("altitude should not be disabled").
  await closeCard(page, "profile-close");
  await expect(page.getByTestId("altitude-input")).toBeEnabled();
  // Allowed: planned through it, the address back to its default.
  await openProfile(page);
  await problem.getByTestId("unflyable-accept-class-b").click();
  await expect(page).not.toHaveURL(/class_b=/);
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
