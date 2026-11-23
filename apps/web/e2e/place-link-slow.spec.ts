import { test, expect } from "@playwright/test";
import { noTips } from "./helpers";
import { slow } from "./sheetHelpers";
import { pickAirplane } from "./startState";

/**
 * A shared airport link on a slow phone draws the place's card, never the
 * page's "Part of the app did not load": the re-audit of 2026-11-22 found
 * /app/plan?place=KRST, with an airplane picked and the CPU four times
 * slower, asking the engine's N-number rule (n_number, by tailOf) before
 * its .wasm was there, 2 runs of 2. The airplane's parts now read it once
 * the engine is in (useTailOf), and the search's strips wait behind their
 * gate. The .wasm is held back two seconds here so the planner's answers
 * always come first, as they did on the audit's run, and every error the
 * page throws is kept to be shown.
 */
test.use({ serviceWorkers: "block" });

test("a place link draws its card while the engine is still loading", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "a phone's size and speed, as the re-audit found it");
  await pickAirplane(page);
  await page.addInitScript(noTips);
  const thrown: string[] = [];
  page.on("pageerror", (e) => thrown.push(String(e)));
  await page.route(
    (url) => url.pathname.endsWith(".wasm"),
    async (route) => {
      await new Promise((done) => setTimeout(done, 2000));
      await route.continue();
    },
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (let run = 0; run < 3; run++) {
    await page.goto("/app/plan?place=KRST");
    await expect(page.getByTestId("fly-here").first()).toBeVisible({ timeout: slow(30_000) });
    await expect(page.getByText(/did not load/i)).toHaveCount(0);
  }
  expect(thrown.filter((e) => /not loaded yet/.test(e))).toEqual([]);
});
