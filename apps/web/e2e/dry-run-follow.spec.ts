import { test, expect } from "@playwright/test";
import { openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The dry run's map follows its airplane as one move, not a start and a
 * stop at every fix (the camera's owner, lib/map/gl/camera).
 */
test("the dry run's map follows its airplane at one steady pace, each fix's ease joined to the last and nothing else moving it", async ({
  page,
}) => {
  // The flicker audit's FL-13 (2026-11-14): each fix began a new 500 ms
  // ease-in-out a quarter second after the last, so the map slowed and
  // sped up again at every fix. Now each is one linear ease lasting till
  // the next fix (the camera owner's follow, which logs its moves on
  // window.__wingtipCamera in a browser a test drives).
  await installFrameRecorder(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
  type Move = { t: number; intent: string; call: string; duration: number | null; linear: boolean };
  const log = () => page.evaluate(() => (window as unknown as { __wingtipCamera?: Move[] }).__wingtipCamera ?? []);
  // Followed: past the move in to the airplane.
  await expect.poll(async () => (await log()).some((m) => m.intent === "dry-run"), { timeout: slow(10_000) }).toBe(true);
  const from = await page.evaluate(() => performance.now());
  // Three seconds of the run: moves allowed, none undone.
  await expectDrawnOnce(page, async () => {}, { maxMoves: Infinity, settleMs: 3000 });
  const moves = (await log()).filter((m) => m.t >= from && m.call !== "setPadding" && !(m.intent === "room" && m.call === "jumpTo"));
  expect(moves.length).toBeGreaterThan(4);
  // Every one the run's own, a linear ease.
  expect(moves.filter((m) => m.intent !== "dry-run" || m.call !== "easeTo" || !m.linear)).toEqual([]);
  // Each begun as the last was due to end, not part way through it.
  for (let i = 1; i < moves.length; i++) expect(moves[i]!.t - moves[i - 1]!.t).toBeGreaterThan(0.6 * moves[i - 1]!.duration!);
});
