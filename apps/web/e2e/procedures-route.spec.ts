import { test, expect } from "@playwright/test";
import { cardClose, grabberTo, openTab, settle, settled, sideDrawer, slow } from "./helpers";
import { tapMarkApart } from "./marks";
import { pickAirplane } from "./startState";
import { LIST, DRAWN } from "./procedureStubs";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test.describe("on the owner's phone's width, to a finger", () => {
  // A finger's 17-point words (pointer: coarse), on 393 points.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 393, height: 695 } });

  test("a pull-down opens on a finger's lift, not its touch, so a scroll begun on it opens nothing", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "a phone's finger");
    await page.goto("/app/plan?dep=C81&dest=ORD");
    await settle(page);
    await openTab(page, "Nav Log");
    const trigger = page.locator("[data-testid=procedure-kind][data-kind=approach]");
    await expect(trigger).toBeVisible({ timeout: slow(20000) });
    // Once it has stopped moving: the route's rows coming in, the runway
    // picked into the wind and its line folding move it down the list, and
    // a touch's lift where it no longer is was no tap (a flake on
    // 48a36f99 as well, one run in two).
    let last = "";
    await expect
      .poll(
        async () => {
          const at = JSON.stringify(await trigger.boundingBox());
          const still = at === last;
          last = at;
          return still;
        },
        { timeout: slow(30000), intervals: [700] },
      )
      .toBe(true);
    const box = (await trigger.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    // Touched and held, no lift: closed.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(400);
    await expect(page.getByTestId("procedure-menu")).toHaveCount(0);
    // Lifted where it was touched: a tap, open.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByTestId("procedure-menu")).toBeVisible();
  });

  test("a route with a procedure's chip and three fields stays one line in the route's box, the field past its end taking no line of its own", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "mobile", "a phone's box");
    // The owner's recording: C81 → its ILS 09 via DLH → KDLH → KRFD, where
    // the empty field after KRFD wrapped onto a second line.
    await page.route(
      (url) => /\/airport\/KDLH\/procedures\/I09/.test(url.pathname),
      (route) => route.fulfill({ json: { ...DRAWN, transition: "DLH" } }),
    );
    await page.goto("/app/plan?dep=C81&stops=KDLH&dest=KRFD&procs=KDLH:I09:DLH");
    await settle(page);
    // Half way, the sheet in from the screen's sides, its box the narrower.
    await grabberTo(page, "half");
    const box = sideDrawer(page).getByTestId("route-box");
    await expect(box.getByTestId("route-procedure")).toBeVisible({ timeout: slow(10000) });
    // Its lines', the buttons over them in FPL's bar (the owner, 2026-11-14).
    expect((await box.getByTestId("route-slide").boundingBox())!.height).toBeLessThanOrEqual(48);
  });
});

test("a procedure picked lengthens the plan by its path: the fuel and the time to the field are the flight flown", async ({ page }) => {
  // The owner's word ("Yes"), after the plan said 909 nm to Jacksonville
  // where the dry run flew 1053 by BENKY6 into O'Hare: the planner flies
  // the leg in by the approach picked, its miles more in the figures.
  const figures = async () => {
    await expect(page.getByTestId("navlog-fuel")).toHaveText(/^\d+\.\d\s?gal$/, { timeout: slow(120_000) });
    return {
      fuel: parseFloat((await page.getByTestId("navlog-fuel").textContent())!),
      ete: (await page.getByTestId("navlog-ete").textContent())!,
    };
  };
  const minutes = (ete: string) => {
    const [, h, m] = /^(?:(\d+)h)? ?(?:(\d+)m)?$/.exec(ete.trim())!;
    return Number(h ?? 0) * 60 + Number(m ?? 0);
  };
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const straight = await figures();
  // Out to PLANE, south-east of the field, and round onto the final.
  await page.goto("/app/plan?dep=C81&dest=KDLH&procs=KDLH:R27:PLANE");
  await settle(page);
  await expect.poll(async () => (await figures()).fuel, { timeout: slow(120_000) }).toBeGreaterThan(straight.fuel);
  const flown = await figures();
  expect(minutes(flown.ete)).toBeGreaterThan(minutes(straight.ete));
  // The breakdown says where the gallons more come from.
  await page.getByTestId("fuel-breakdown-open").click();
  await expect(page.getByTestId("fuel-breakdown")).toContainText(/\d+\.\d nm more by the procedures picked/);
});

test("an approach can be flown direct to one of its fixes, as ATC sends an airplane, and back as charted", async ({ page }) => {
  // The owner's ask: "the procedures should give the ability to go direct
  // to a fix as told by ATC".
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/KDLH/procedures")) return route.fulfill({ json: LIST });
      if (url.pathname.endsWith("/plate")) return route.fulfill({ status: 404, json: { detail: "none" } });
      if (url.pathname.endsWith("/KDLH/procedures/I09"))
        return route.fulfill({ json: { ...DRAWN, transition: url.searchParams.get("transition") } });
      return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&procs=KDLH:I09:DLH");
  await settle(page);
  await openTab(page, "Nav Log");
  const kdlh = page.getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  const approach = kdlh.locator("[data-testid=procedure-kind][data-kind=approach]");
  await expect(approach).toContainText("ILS 09 · DLH", { timeout: slow(20000) });
  await approach.click();
  const menu = page.getByTestId("procedure-menu");
  await expect(menu.getByTestId("procedure-menu-direct")).toContainText("As charted");
  await menu.getByTestId("procedure-menu-direct").click();
  // The procedure's own fixes, the missed approach's and the runway's not.
  await expect(menu.getByTestId("procedure-menu-direct-fix")).toHaveText(["As charted", "DLH", "OFOFO", "FAKER"]);
  await menu.getByTestId("procedure-menu-direct-fix").filter({ hasText: "FAKER" }).click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:)FAKER(&|$)/);
  await settled(sideDrawer(page));
  await openTab(page, "Nav Log");
  await expect(approach).toContainText("ILS 09 · direct FAKER");
  // Back as charted.
  await approach.click();
  await menu.getByTestId("procedure-menu-direct").click();
  await menu.getByTestId("procedure-menu-direct-fix").filter({ hasText: "As charted" }).click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(&|$)/);
});

test("a procedure's fixes branch off the route, each sent direct to or given an altitude to cross it at, from the list or the map", async ({
  page,
}) => {
  // The owner's pick, option 4 of the fix canvas: "expandable list of
  // connected points like git graph", any fix direct to or an altitude
  // to cross it at, its card opened from the list or the map.
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/KDLH/procedures")) return route.fulfill({ json: LIST });
      if (url.pathname.endsWith("/plate")) return route.fulfill({ status: 404, json: { detail: "none" } });
      if (url.pathname.endsWith("/KDLH/procedures/I09"))
        return route.fulfill({ json: { ...DRAWN, transition: url.searchParams.get("transition") } });
      return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&procs=KDLH:I09:DLH");
  await settle(page);
  await openTab(page, "Nav Log");
  const kdlh = page.getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  const toggle = kdlh.getByTestId("fix-branch-toggle");
  // The branch's head, after the runways: the approach's name with the
  // fold's arrow beside it, its kind and its fixes under it, and the
  // button to pick another at its right, at the owner's ask.
  const branchHead = kdlh.getByTestId("fix-branch");
  await expect(branchHead).toContainText("ILS 09 · DLH", { timeout: slow(20000) });
  await expect(branchHead).toContainText("Approach · 3 fixes");
  await expect(kdlh.locator("[data-testid=procedure-kind][data-look=button]")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const rows = kdlh.getByTestId("fix-branch-row");
  await expect(rows).toHaveCount(3);
  // Direct to FAKER from its row: kept in the address, the fixes before it skipped.
  await rows.filter({ hasText: "FAKER" }).getByTestId("fix-branch-menu").click();
  await page.getByTestId("fix-branch-menu-direct").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:)FAKER(&|$)/);
  await settled(sideDrawer(page));
  await openTab(page, "Nav Log");
  // Opened again where the plan made again folded it.
  await expect(async () => {
    if (!(await rows.first().isVisible())) await toggle.click();
    await expect(rows.filter({ hasText: "FAKER" })).toContainText("direct to", { timeout: 2000 });
  }).toPass({ timeout: slow(15000) });
  await expect(rows.filter({ hasText: "OFOFO" })).toContainText("skipped");
  // OFOFO given 3,000 to cross at, from its card.
  await rows.filter({ hasText: "OFOFO" }).getByTestId("fix-branch-menu").click();
  await page.getByTestId("fix-branch-menu-altitude").click();
  const card = page.getByTestId("fix-card");
  await expect(card).toBeVisible();
  await card.getByTestId("fix-card-altitude").fill("3000");
  await card.getByTestId("fix-card-set").click();
  await expect(page).toHaveURL(/[?&]cross=OFOFO(%3A|:)3000(&|$)/);
  await expect(card.getByTestId("fix-card-charted")).toBeVisible();
  await card.getByTestId("fix-card-charted").click();
  await expect(page).not.toHaveURL(/[?&]cross=/);
  await cardClose(page, "fix-card-close").click();
  await expect(card).toHaveCount(0);
  await grabberTo(page, "peek"); // the same card from the fix on the map, the sheet down
  await tapMarkApart(page, "procedure-fixes", "FAKER", "OFOFO"); // at the route's zoom KDLH lies by them
  await expect(page.getByTestId("fix-card")).toBeVisible();
  await expect(page.getByTestId("fix-card-direct")).toContainText("as Charted");
});
