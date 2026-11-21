import { test, expect } from "@playwright/test";
import { closeProfile, grabberTo, inSheet, openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";
import { markWith } from "./marks";
import { pickAirplane } from "./startState";
import { shipAt } from "./ownShipProbes";
import { R27 } from "./approachR27";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

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
  await expect(panel.getByTestId("route-summary")).toBeVisible({ timeout: slow(60_000) });
  await expect(panel.getByTestId("foot-pager")).toHaveCount(0);
  await expect(panel.getByTestId("mini-profile")).toHaveCount(0);
  // The Nav Log in the floating bar at the sheet's foot (FplTabBar; the
  // owner, 2026-11-16), the Profile at the altitude pill's end (the owner,
  // 2026-11-20).
  await expect(panel.getByTestId("fpl-actions").getByTestId("route-navlog")).toBeVisible();
  await expect(panel.getByTestId("altitude-group").getByTestId("route-profile")).toBeVisible();
  const card = await openProfile(page);
  // Named Profile, by how much the cruise clears the ground the short line
  // under the name (ProfileLine): the cruise itself is the side view's tag
  // and FPL's altitude, not said again (the owner's list, 2026-11-17).
  await expect(card.getByTestId("profile-name")).toHaveText("Profile");
  await expect(card.getByTestId("card-sub").first()).toHaveText(/^Clears terrain by [\d,]+ ft$|^[\d,]+ ft below terrain$/, {
    timeout: slow(60_000),
  });
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
  await expect(panel.getByTestId("route-summary")).toBeVisible();
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
  // The chart's drag (the stock Slider over it): a tap at its right end takes the run there; End to the end.
  const scrub = panel.getByTestId("dry-run-scrub");
  const thumb = scrub.getByRole("slider", { name: "Where the dry run is along the course" });
  // The Profile card opens half way (e7bb15ec8): pulled up to the scrubber, as a finger would.
  await inSheet(page, scrub);
  const box = (await scrub.boundingBox())!;
  const end = Number(await thumb.getAttribute("max")); // the stock Slider's range input's own
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
  await page.keyboard.press("PageUp"); // five miles (an arrow is a tenth, 923b30ba7)
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
