import { test, expect } from "@playwright/test";
import {
  chartZoom,
  closeProfile,
  grabberTo,
  inSheet,
  openPanel,
  openProfile,
  pressDryRunStart,
  settle,
  settled,
  sideDrawer,
  slow,
} from "./helpers";
import { markWith } from "./marks";
import { pickAirplane } from "./startState";
import { middleOfMap, shipAt } from "./ownShipProbes";
import { R27 } from "./approachR27";
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
  // To, Dist, ETE and Fuel, their taps the same, where the run had its own
  // (Dist left, Time left, ETA, To burn).
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeEnabled({ timeout: slow(60_000) });
  const line = sideDrawer(page).getByTestId("flight-line");
  // Each figure's name as shown: FlightLine's dt also holds the words a
  // screen reader hears ("To KDLH"), hidden from sight (sr-only).
  const planned = await line.locator("dt > [aria-hidden]").allTextContents();
  expect(planned).toEqual(["To", "Dist", "ETE", "Fuel req"]);
  // The figures once the plan has settled: the runways picked into the
  // wind as the route comes in plan it again with their patterns flown
  // (with_procedures), a few miles more.
  const distNow = async () => line.locator("dd").nth(1).innerText();
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
  await expect(figures.locator("dt > [aria-hidden]")).toHaveText(planned);
  await expect(figures.getByTestId("navlog-to")).toHaveText("KDLH");
  await expect(figures.getByTestId("ete-eta-toggle")).toBeVisible();
  await expect(figures.getByTestId("fuel-breakdown-open")).toBeVisible();
  const leftNm = async () => parseFloat(await figures.locator("dd").nth(1).innerText());
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
    await settled(sideDrawer(page));
    await expect(async () => {
      const at = await shipAt(page, true),
        middle = await middleOfMap(page);
      expect(Math.abs(at.x - middle.x)).toBeLessThan(40);
      expect(Math.abs(at.y - middle.y)).toBeLessThan(40);
    }).toPass({ timeout: slow(10_000) });
  };
  await grabberTo(page, "peek");
  await inTheMiddle();
  await grabberTo(page, "half");
  await inTheMiddle();
  // Panned by hand, off the middle: the map no longer follows it, and the
  // arrow offers to again.
  const viewport = page.viewportSize()!;
  const from = { x: viewport.width < 768 ? viewport.width / 2 : viewport.width * 0.75, y: 150 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 90, from.y - 60, { steps: 8 });
  await page.mouse.up();
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
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

test("the profile is a card from its button beside the AI brief's, no swipe at the foot; a dry run started there plays over the route, and stopped, the card is back", async ({
  page,
}) => {
  // The owner's ask (2026-10-20): "profile view can move next to the
  // navlog button and open like brief and navlog opens instead of the
  // swipe"; and before, "When stopping dry run it should become profile
  // view".
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  const panel = sideDrawer(page);
  await expect(panel.getByTestId("procedures")).toBeVisible({ timeout: slow(60_000) });
  await expect(panel.getByTestId("foot-pager")).toHaveCount(0);
  await expect(panel.getByTestId("mini-profile")).toHaveCount(0);
  // Its own button in the route's row, where the nav log's was (the
  // owner, 2026-11-04), the nav log in the route's ••• menu.
  await expect(panel.getByTestId("route-navlog")).toHaveCount(0);
  const card = await openProfile(page);
  // Named Profile, its cruise and clearance verdict the short line under
  // the name, as the cards canvas draws it (95f9e953b's ProfileLine).
  await expect(card.getByTestId("profile-name")).toHaveText("Profile");
  await expect(card.getByTestId("card-sub").first()).toContainText(/^Cruise /);
  await expect(card.getByTestId("mini-profile")).toBeVisible();
  // Flown in the card, in the side view's place (the owner's "profile
  // should play the dry run within profile card"); stopped, the side view
  // again.
  const start = card.getByTestId("dry-run-start");
  await expect(start).toBeEnabled({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(card.getByTestId("dry-run")).toBeVisible();
  await expect(card.getByTestId("mini-profile")).toHaveCount(0);
  await card.getByTestId("dry-run-close").click();
  await expect(card.getByTestId("mini-profile")).toBeVisible();
  // Its close: FPL's route again.
  await closeProfile(page);
  await expect(panel.getByTestId("procedures")).toBeVisible();
});

test("the dry run is the Profile card's: closed, the run is put away and FPL's foot is the flight's figures again", async ({ page }) => {
  // The owner's notice: "I still see dry run in fpl after I play it in
  // profile card once" -- it went on at FPL's foot, over the route.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  await openProfile(page);
  const start = panel.getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(panel.getByTestId("dry-run")).toBeVisible();
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
  await closeProfile(page);
  await expect(panel.getByTestId("dry-run")).toHaveCount(0);
  await expect(page.locator("[data-own-ship]")).toHaveCount(0);
  await expect(panel.getByTestId("flight-line")).toBeVisible();
});

test("with an approach picked, the dry run flies it into the field: out to its first fix and down its final", async ({ page }) => {
  // The owner's notice: "Dry run is not following approach when selected".
  await page.route(
    (url) => /\/airport\/KDLH\/procedures\/R27$/.test(url.pathname),
    (route) => route.fulfill({ json: R27 }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&procs=KDLH:R27:PLANE");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  // The approach drawn, so in hand as the run starts.
  await expect.poll(markWith(page, "procedure-fixes", "CIRUS"), { timeout: slow(10_000) }).not.toBeNull();
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
  // Held at its end, then ten miles back: on the final, between HOMUV and
  // CIRUS -- where straight in it was still south-east of the field.
  const panel = sideDrawer(page);
  await panel.getByTestId("dry-run-play").click();
  // The chart's drag (shadcn's Slider over it): a tap at its right end
  // takes the run there, within a pixel's tenths of a mile; End to the end.
  const scrub = panel.getByTestId("dry-run-scrub");
  const thumb = scrub.getByRole("slider", { name: "Where the dry run is along the course" });
  // The Profile card is half way, as every card opens (e7bb15ec8): pulled up
  // to the scrubber, as a finger would, before a tap at its end.
  await inSheet(page, scrub);
  const box = (await scrub.boundingBox())!;
  // The stock Slider's range input says its end as its own max.
  const end = Number(await thumb.getAttribute("max"));
  expect(end).toBeGreaterThan(0);
  await page.mouse.click(box.x + box.width - 0.5, box.y + box.height / 2);
  await expect.poll(async () => Number(await thumb.getAttribute("aria-valuenow"))).toBeGreaterThan(end - 2);
  await expect(thumb).toHaveAttribute("aria-valuetext", /^\d+ nm, [\d,]+ feet, (\d+ knots|no ground speed)$/);
  await thumb.focus();
  await page.keyboard.press("End");
  await expect(thumb).toHaveAttribute("aria-valuenow", String(end));
  // Ten miles back: Page Down is the stock Slider's large step, five miles
  // (923b30ba7; an arrow is its step, a tenth of a mile).
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect.poll(async () => Number(await thumb.getAttribute("aria-valuenow"))).toBeCloseTo(end - 10, 0);
  const fixAt = async (ident: string) => (await markWith(page, "procedure-fixes", ident)())!; // its point (ProceduresGl's probe)
  await expect(async () => {
    const ship = await shipAt(page, true),
      from = await fixAt("HOMUV"),
      to = await fixAt("CIRUS");
    // HOMUV to CIRUS is 5.9 nm: the ship within half a mile of the line
    // between them, and between them along it.
    const dx = to.x - from.x,
      dy = to.y - from.y,
      length = Math.hypot(dx, dy);
    const along = ((ship.x - from.x) * dx + (ship.y - from.y) * dy) / (length * length);
    const off = Math.abs((ship.x - from.x) * dy - (ship.y - from.y) * dx) / length;
    expect(along).toBeGreaterThan(0);
    expect(along).toBeLessThan(1);
    expect(off).toBeLessThan((length / 5.9) * 0.5);
  }).toPass({ timeout: slow(10_000) });

  // No from the start (the chart's drag takes the run back), and Go
  // missed on the final only (the owner's "I don't think we need the
  // replay button, instead just show a go missed button when on the final
  // of the approach"): not here, before the final approach fix; five
  // miles on, inside CIRUS on the final, there. Pressed, the run goes on
  // past the runway along the missed approach and ends at its hold's fix,
  // UDTEG, where it ended at the runway.
  await expect(panel.getByTestId("dry-run-again")).toHaveCount(0);
  const missed = panel.getByTestId("dry-run-missed");
  await expect(missed).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(missed).toBeVisible();
  await missed.click();
  await expect(missed).toHaveCount(0);
  await thumb.focus();
  await page.keyboard.press("End");
  await expect(async () => {
    const ship = await shipAt(page, true),
      udteg = await fixAt("UDTEG");
    expect(Math.hypot(ship.x - udteg.x, ship.y - udteg.y)).toBeLessThan(12);
  }).toPass({ timeout: slow(10_000) });
});
