import { test, expect } from "@playwright/test";
import { noTips } from "./helpers";
import { slow } from "./sheetHelpers";
import { pickAirplane } from "./startState";

/**
 * The JavaScript a route link really loads, against its budget: every
 * script a phone fetches from opening /app/plan?dep=KPWK&dest=KDLH on a
 * cold page to the route's time en route on screen, the lazily loaded
 * chunks with the first load. first-load.mjs (CI's build leg) counts only
 * the first load's static graph, 0.97 of these 4.2 MB on the speed audit's
 * build of 2026-11-21, so the route panel's chunk grew to 507 KB with
 * every card in it and nothing said so.
 *
 * Measured as the audit measured it, so the budget is its figure: the
 * phone project (390 by 844), the CPU four times slower (DevTools'
 * throttling, as speed-lab.spec), no service worker (the config's), the
 * C172 picked, a page with nothing in its cache, every resource ending
 * ".js" by its decoded size (the bytes parsed) once the ETE has a digit.
 * The audit's cold open read 4,198,439 bytes in 204 files (PR #589's head,
 * 8a5e7222c; scratchpad audit/p/out/results.jsonl, run 0), and the wave's
 * 4,234,091 in 221 (validate run 2, bf0cb28e4): both counted what was
 * fetched ahead for a later tap -- the pilot console, the cards drawn at a
 * tap, the search's page -- on timers from the page's mount, which a slow
 * route outran. Those wait for the route to draw now (lib/routeDrawn), and
 * the open reads 3,605,492 bytes in 176 files, at four times slower and at
 * sixteen alike (claude/w2-route's build, the mobile project). The wave
 * after read 3,622,605 (the re-audit of 2026-11-22), the route list's drag
 * and drop with it; that waits for the list's first touch now
 * (procedures/RouteGrid), and the open reads 3,433,286 in 163 (claude/
 * reaudit-fix's build, the mobile project). The wave read 3,434,352 with
 * the route box's toggle; the solo cross-country review's form waits for
 * its sheet now (brief/SaveFlight), and the open reads 3,429,641 in 163
 * (claude/w3-a's build, the mobile project). The wave after read
 * 3,431,166; the Brief's Checklists page waits for the Brief now
 * (brief/FlightChecklists), and the open reads 3,428,154 in 162 (claude/
 * w3-a's build, the mobile project). Keep for the Air's wait for the
 * service worker to hold the page read 3,428,472; its fetching waits for
 * a keep now (lib/map/route/keepFetch), and the open reads 3,426,569 in
 * 162 (claude/w3-a's build, the mobile project). The figure
 * is written to the test's annotations each run; a change that brings it
 * down lowers the budget to the new figure, never the other way (the
 * measure-speed skill; CLAUDE.md, "The ratchet only goes down").
 */
const ROUTE_LOAD_BUDGET = 3_426_569;

test.use({ serviceWorkers: "block" });

test("a route link loads no more JavaScript than its budget", { tag: "@smoke" }, async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "measured at a phone's size, as the budget was");
  await pickAirplane(page);
  await page.addInitScript(noTips);
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/app/plan?dep=KPWK&dest=KDLH");
  await expect(page.getByTestId("navlog-ete").first()).toHaveText(/\d/, { timeout: slow(60_000) });
  const js = await page.evaluate(() =>
    (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((e) => new URL(e.name).pathname.endsWith(".js"))
      .map((e) => ({ file: new URL(e.name).pathname.split("/").pop() ?? "", bytes: e.decodedBodySize })),
  );
  const total = js.reduce((sum, e) => sum + e.bytes, 0);
  const largest = [...js].sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  info.annotations.push({ type: "route load bytes", description: `${total} in ${js.length} files` });
  info.annotations.push({ type: "largest", description: largest.map((e) => `${e.file} ${e.bytes}`).join(", ") });
  console.log(`route load: ${total} bytes of JavaScript in ${js.length} files, budget ${ROUTE_LOAD_BUDGET}`);
  expect(total, `${total} bytes in ${js.length} files; the largest: ${largest.map((e) => e.file).join(", ")}`).toBeLessThanOrEqual(
    ROUTE_LOAD_BUDGET,
  );
});
