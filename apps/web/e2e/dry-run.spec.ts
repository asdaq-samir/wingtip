import { test, expect, type Locator } from "@playwright/test";
import { chartZoom, frontSheet, grabberTo, openPanel, openProfile, pressDryRunStart, settle, settled, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";
import { middleOfFront, shipAt } from "./ownShipProbes";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The planned flight's dry run flies own ship, as if a pilot were flying
 * the route (lib/map/position/ownShip's simulateFix): the location arrow on, own
 * ship moving along the course with the plan's heading, and put back as
 * the pilot had it -- here off, no GPS asked -- when the run is closed; nothing of it kept as where the pilot has flown (ownTrail).
 */
test("the dry run flies own ship along the route, and gives it back as it was", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await expect(page.locator("[data-own-ship]")).toHaveCount(0);

  await pressDryRunStart(page, start);
  const ship = page.locator('[data-own-ship="on"]');
  await expect(ship).toHaveCount(1);
  // The airplane followed: the location arrow is the whole route's button
  // (the owner's "Can the locator button change to fit line during dry
  // run when plane is centered on the screen"). Tapped, the map takes the
  // route, and the arrow comes back to bring the airplane to the middle. Each tap goes out to the route and back in on the airplane (the
  // owner's "toggling the zoom in and out is not working"): the base
  // chart's level in use, its top tile container's.
  const level = () => chartZoom(page);
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAttribute("data-face", "route");
  await expect(arrow).toHaveAccessibleName("Show the whole route");
  await expect.poll(level, { timeout: slow(10_000) }).toBe(10);
  await arrow.click();
  await expect(arrow).toHaveAttribute("data-face", "position");
  await expect(arrow).toHaveAccessibleName("Follow the airplane");
  await expect.poll(level, { timeout: slow(10_000) }).toBeLessThan(10);
  await arrow.click();
  await expect(arrow).toHaveAttribute("data-face", "route");
  await expect.poll(level, { timeout: slow(10_000) }).toBe(10);
  // Moving: its place on the chart changes as the run plays (with the
  // map following it, the marker itself may stay put, so the map pane's too).
  const where = () =>
    page.evaluate(() => {
      const icon = document.querySelector('[data-own-ship="on"]')!.closest(".maplibregl-marker") as HTMLElement;
      const map = document.querySelector<HTMLElement>("[data-testid=gl-map]")!;
      return `${icon.style.transform} ${map.dataset.center}`;
    });
  const first = await where();
  await expect.poll(where, { timeout: slow(10_000) }).not.toBe(first);

  await sideDrawer(page).getByTestId("dry-run-close").click();
  await expect(page.locator("[data-own-ship]")).toHaveCount(0);
  const kept = await page.evaluate(() => ({
    ship: localStorage.getItem("wingtip.ownship"),
    trail: localStorage.getItem("wingtip.owntrail"),
  }));
  expect(JSON.parse(kept.ship ?? "{}").state?.enabled ?? false).toBe(false);
  expect(kept.trail).toBeNull();
});

test("the dry run's chart draws the airspace the course passes through, named as the side view names it", async ({ page }) => {
  // The owner's ask: "Also draw the airspace on the dry run as well". Out
  // of C81, under Chicago's Class B, to Madison's Class C.
  await page.goto("/app/plan?dep=C81&dest=KMSN");
  await settle(page);
  await openProfile(page);
  const side = sideDrawer(page).getByTestId("mini-profile-airspace");
  await expect(side.first()).toBeVisible({ timeout: slow(60_000) });
  const names = (await side.allTextContents()).map((t) => t.trim()).sort();
  expect(names.some((n) => n.startsWith("KMSN "))).toBe(true);

  await pressDryRunStart(page, sideDrawer(page).getByTestId("dry-run-start"));
  const run = sideDrawer(page).getByTestId("dry-run");
  // Each piece drawn, and each name once, as the side view had them (the
  // chart's only labels: recharts draws them in a layer of their own).
  await expect.poll(() => run.locator(".recharts-reference-area").count(), { timeout: slow(10_000) }).toBeGreaterThanOrEqual(names.length);
  const drawn = async () => (await run.locator(".recharts-label").allTextContents()).map((t) => t.trim()).sort();
  await expect.poll(drawn).toEqual(names);
  // Inside the chart, its ends' names too.
  const chart = (await run.locator(".recharts-surface").boundingBox())!;
  for (const box of await run.locator(".recharts-label").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }),
  )) {
    expect(box.left).toBeGreaterThanOrEqual(chart.x - 1);
    expect(box.right).toBeLessThanOrEqual(chart.x + chart.width + 1);
  }
});

test("the dry run waits for the legs: no way to it until the plan is in, and then it flies", async ({ page }) => {
  // A tap before the legs had streamed in did nothing (the side view is
  // drawn before them): seen as the phone's run of this spec tapped it.
  // The Profile card, where the dry run is, opens from the altitude's
  // button, which shows only once there is a plan (the owner's ask: "profile
  // button only shows with an altitude there"), so with the plan held back
  // there is no way to the run at all.
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route(
    (url) => url.pathname.endsWith("/planner/navlog"),
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await expect(sideDrawer(page).getByTestId("altitude-group")).toBeVisible({ timeout: slow(60_000) });
  await expect(sideDrawer(page).getByTestId("altitude-why")).toHaveCount(0);
  release();
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeEnabled({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
});

test("the dry run keeps the flight's own figures at the foot, counting down from where the airplane is", async ({ page }) => {
  // The owner's "Dry run should keep the calculations as in the profile":
  // Dist, ETE and Fuel, their taps the same, where the run had its own
  // (Dist left, Time left, ETA, To burn); no To, which the flying head
  // over the map names (the owner, 2026-11-17).
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeEnabled({ timeout: slow(60_000) });
  const line = sideDrawer(page).getByTestId("flight-line");
  // Each figure's name as shown: TripFigures' dt also holds the words a
  // screen reader hears ("To KDLH"), hidden from sight (sr-only), and a
  // name that explains itself is a button (Explain), not a hidden span.
  const names = (strip: Locator) =>
    strip.locator("dt").evaluateAll((dts) =>
      dts.map((dt) => {
        const shown = dt.cloneNode(true) as HTMLElement;
        shown.querySelectorAll(".sr-only").forEach((n) => n.remove());
        return (shown.textContent ?? "").trim();
      }),
    );
  const planned = await names(line);
  expect(planned).toEqual(["Dest", "Distance", "Time", "Fuel"]);
  // The figures once the plan has settled: the runways picked into the
  // wind as the route comes in plan it again with their patterns flown
  // (with_procedures), a few miles more.
  // Read from the page, not as drawn: FPL's strip is under the Profile's
  // card, out of sight (SheetParts' cardsUp), where innerText reads nothing.
  const distNow = async () => ((await line.locator("dd").nth(1).textContent()) ?? "").replace(/,/g, "");
  await expect
    .poll(
      async () => {
        const was = await distNow();
        await page.waitForTimeout(1500);
        return was === (await distNow());
      },
      { timeout: slow(30_000) },
    )
    .toBe(true);
  const plannedNm = parseFloat(await distNow());

  await pressDryRunStart(page, start);
  const figures = sideDrawer(page).getByTestId("dry-run-figures");
  await expect.poll(async () => (await names(figures)).slice(0, 3)).toEqual(planned.slice(1));
  await expect(figures.getByTestId("navlog-to")).toHaveCount(0);
  await expect(figures.getByTestId("ete-eta-toggle")).toBeVisible();
  await expect(figures.getByTestId("fuel-breakdown-open")).toBeVisible();
  const leftNm = async () => parseFloat((await figures.locator("dd").nth(0).innerText()).replace(/,/g, ""));
  expect(await leftNm()).toBeLessThanOrEqual(Math.ceil(plannedNm));
  await expect.poll(leftNm, { timeout: slow(15_000) }).toBeLessThan(plannedNm - 1);
});

test("the dry run's airplane is kept in the middle of what the panel leaves as the sheet goes down and up; panned, it is the pilot's map until the arrow", async ({
  page,
}) => {
  // The owner's notice: "during dry run map should adjust as well to the
  // pill and half card". A pan makes the map the pilot's, as Apple Maps'
  // tracking ends on a drag (4087efc57, "I like the stock behavior"): the
  // sheet then only pads it, and the location arrow takes it back.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
  const inTheMiddle = async () => {
    await settled(frontSheet(page));
    await expect(async () => {
      const at = await shipAt(page, true),
        middle = await middleOfFront(page);
      expect(Math.abs(at.x - middle.x)).toBeLessThan(40);
      expect(Math.abs(at.y - middle.y)).toBeLessThan(40);
    }).toPass({ timeout: slow(10_000) });
  };
  await grabberTo(page, "peek");
  await inTheMiddle();
  await grabberTo(page, "half");
  await inTheMiddle();
  // Panned by hand, off the middle: the map no longer follows it, and the arrow offers to again.
  const viewport = page.viewportSize()!;
  const from = { x: viewport.width < 768 ? viewport.width / 2 : viewport.width * 0.75, y: 150 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 90, from.y - 60, { steps: 8 });
  await page.mouse.up();
  // Never the whole route in sight at the run's zoom: the route's first (MyPositionButton's routeAway).
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAccessibleName("Show the whole route");
  await arrow.click();
  await expect(arrow).toHaveAccessibleName("Follow the airplane");
  await arrow.click();
  await inTheMiddle();
});

test("half way a dry run started from the profile's card plays in the card, in on its airplane", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  // The owner's asks: "Let's make the half card this tall. This way we
  // won't have to hide the buttons for dry run"; "the dry run drags up
  // instead of staying still like the profile".
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  const panel = sideDrawer(page);
  // The finest sectional level drawn (the coarse one kept under the map,
  // ChartTiles, aside): the route's as it was fitted, then on play the
  // dry run's, in on its airplane, smoothly (the owner's "When play is
  // pressed it should also zoom into plane on the route"). Read before
  // the profile opens: it opens through the map's Play, whose run zooms
  // in before the helper stops it.
  const level = () => chartZoom(page);
  await settled(panel);
  const fitted = await level();
  await openProfile(page);
  const start = panel.getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  // In the card, in the side view's place (the owner's "profile should play
  // the dry run within profile card").
  const run = page.getByTestId("profile-card").getByTestId("dry-run");
  await expect(run).toBeVisible();
  expect(fitted).toBeLessThan(10);
  await expect.poll(level, { timeout: slow(10_000) }).toBe(10);
});

test(
  "the side view is a skeleton of the ground and the climb while its ground is fetched, not an empty box",
  { tag: "@smoke" },
  async ({ page }) => {
    // The design review, 2026-10-28: a blank white box under the Dry run.
    let answer: (() => void) | null = null;
    await page.route(
      (url) => url.pathname.endsWith("/route-profile"),
      async (route) => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        await route.continue().catch(() => {});
      },
    );
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    const card = await openProfile(page);
    const skeleton = card.getByTestId("mini-profile-skeleton");
    await expect(skeleton).toBeVisible({ timeout: slow(60_000) });
    await expect(skeleton).toHaveRole("status");
    await expect(skeleton).toContainText("Fetching the side view");
    // As tall as the chart will be: the card's height, not a strip.
    expect((await skeleton.boundingBox())!.height).toBeGreaterThan(96);
    await expect.poll(() => answer !== null, { timeout: slow(30_000) }).toBe(true);
    answer!();
    await expect(card.getByTestId("mini-profile")).toBeVisible({ timeout: slow(30_000) });
    await expect(skeleton).toHaveCount(0);
  },
);
