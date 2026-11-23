import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { drawn, settle } from "../helpers";
import { pickAirplane } from "../startState";
import { installProbes, pushFix, readWake, readWork, type SimState } from "./simProbes";

/**
 * The test flight (docs/SIM-FLIGHT.md): a simulator flies the flight
 * script (tools/sim-flight/flights) and the web app is given its fixes as
 * the phone's GPS, one a second, as it flies. Run by
 * scripts/dev/sim-flight.sh against the live stack with the feed up
 * (SIM_FEED_URL), never by CI: no runner has a simulator. It checks, all
 * through one flight, each softly so one flight says everything:
 *
 * - the nav log's next checkpoint (FlyingHead) moves on along the route;
 * - what is ahead (AlertsBanner) is said when the planner finds it, and
 *   the airspace the script expects is found in its phases;
 * - the scripted traffic is drawn about the map (TrafficGl's probe);
 * - the screen is kept on while flying, and let go after;
 * - the flight is offered for the logbook with its landings and route;
 * - each fix's work stays bounded: the engine's calls and the DOM's
 *   mutations a fix, against the script's budgets.
 *
 * The planner's answers are the stack's own (the alerts asked through),
 * but its traffic: adsb.lol's sky has no simulator in it, so /traffic is
 * answered with the script's traffic, as traffic.spec stubs it.
 */

const FEED = process.env.SIM_FEED_URL ?? "http://localhost:8765";
const OUT = process.env.SIM_RUN_DIR ?? "test-results/sim-flight";
/** Fixes left out of the work's budgets: the page loading and the plan coming. */
const WARM_FIXES = 30;

test.use({ permissions: ["geolocation"] });

interface Check {
  name: string;
  ok: boolean | null;
  detail: string;
}

interface Alert {
  kind: string;
  class: string | null;
  name: string;
}

const getJson = async <T>(path: string): Promise<T> => (await fetch(`${FEED}${path}`)).json() as Promise<T>;

const percentile = (values: number[], p: number) => {
  const ranked = [...values].sort((a, b) => a - b);
  return ranked.length ? ranked[Math.max(0, Math.ceil((p / 100) * ranked.length) - 1)]! : 0;
};

/** The planner's shape for a scripted airplane (traffic.spec's TRAFFIC). */
const asTraffic = (s: SimState | null) => ({
  source: "adsb.lol",
  license: "ODbL 1.0",
  age_s: 1,
  aircraft: (s?.traffic ?? []).map((t) => ({
    hex: t.hex,
    callsign: t.callsign,
    lat: t.lat,
    lon: t.lon,
    altitude_ft: Math.round(t.alt_ft),
    pressure_altitude: false,
    track_deg: t.track_deg,
    speed_kt: Math.round(t.gs_kt),
    vertical_fpm: Math.round(t.vs_fpm),
  })),
});

/** What the page shows a moment: the next checkpoint, the alert said. */
const shown = (page: Page) =>
  page.evaluate(() => ({
    next: document.querySelector('[data-testid="flying-next-name"]')?.textContent?.trim() ?? null,
    figures: document.querySelector('[data-testid="flying-next-figures"]')?.textContent?.trim() ?? null,
    banner: document.querySelector('[data-alerts-banner] [data-testid="alerts-banner-title"]')?.textContent?.trim() ?? null,
  }));

test("the test flight, flown by the simulator", async ({ page }) => {
  test.setTimeout(Number(process.env.SIM_TIMEOUT_MIN ?? 90) * 60_000);
  const scenario = await getJson<{
    name: string;
    plan: string;
    airplane: { profile: string; label: string };
    traffic: string[];
    expect: {
      checkpoints?: string[];
      alerts?: (Alert & { phases: string[] })[];
      landings?: number;
      route_has?: string[];
      budgets?: { engine_calls_per_fix_p95?: number; mutations_per_fix_p95?: number; rule_per_fix?: Record<string, number> };
    };
  }>("/scenario");
  await pickAirplane(page, scenario.airplane);
  await installProbes(page);
  await page.addInitScript(() => {
    localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: true }, version: 0 }));
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: true, alerts: true } }));
  });
  let latest: SimState | null = null;
  let trafficAsks = 0;
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => {
      trafficAsks += 1;
      return route.fulfill({ json: asTraffic(latest) });
    },
  );
  const answers: { at: number; phase: string; alerts: Alert[] }[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airspace/ahead"),
    async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as { alerts?: Alert[] };
      answers.push({ at: Date.now(), phase: latest?.phase ?? "", alerts: json.alerts ?? [] });
      return route.fulfill({ response, json });
    },
  );
  await page.goto(scenario.plan);
  await settle(page);

  const work: { engine: number; mutations: number }[] = [];
  const byRule: Record<string, number> = {};
  const names: string[] = [];
  const said: { expected: string; banner: string | null }[] = [];
  const nearer: boolean[] = [];
  let lastSeq = -1;
  let airborne = 0;
  let headShown = 0;
  let flyingFixes = 0;
  let wakeHeld = 0;
  let trafficDrawn = false;
  let lastFigures = null as { name: string; nm: number } | null;
  const deadline = Date.now() + Number(process.env.SIM_TIMEOUT_MIN ?? 90) * 60_000 - 5 * 60_000;
  while (Date.now() < deadline) {
    const { state } = await getJson<{ state: SimState | null }>("/state");
    if (!state || state.seq === lastSeq) {
      await page.waitForTimeout(200);
      continue;
    }
    // The work since the last fix is that fix's: read before the next.
    const done = await readWork(page);
    if (lastSeq >= 0) {
      work.push({ engine: done.engine, mutations: done.mutations });
      for (const [rule, n] of Object.entries(done.byRule)) byRule[rule] = (byRule[rule] ?? 0) + n;
    }
    lastSeq = state.seq;
    latest = state;
    await pushFix(page, state);
    if (state.done) break;
    const now = await shown(page);
    if (now.next && names.at(-1) !== now.next) names.push(now.next);
    const nm = Number(/([\d.]+)\s*nm/.exec(now.figures ?? "")?.[1]);
    if (now.next && Number.isFinite(nm)) {
      if (lastFigures?.name === now.next) nearer.push(nm <= lastFigures.nm + 0.05);
      lastFigures = { name: now.next, nm };
    }
    // Flying mode comes a moment after the airplane is underway.
    airborne = state.on_ground ? 0 : airborne + 1;
    if (airborne > 30) {
      flyingFixes += 1;
      if (now.next) headShown += 1;
      if ((await readWake(page)).held > 0) wakeHeld += 1;
    }
    // The planner's latest answer, once the page has had 3 s to say it.
    const answer = answers.at(-1);
    if (answer?.alerts.length && Date.now() - answer.at >= 3000)
      said.push({ expected: answer.alerts[0]!.name.split(" ")[0]!.toLowerCase(), banner: now.banner });
    if (state.traffic.length && !trafficDrawn) {
      const marks = await drawn(page, "traffic-marks");
      trafficDrawn = marks.some((m) => scenario.traffic.some((c) => String(m.label ?? "").includes(c)));
    }
  }

  // The logbook looks at the track once a minute of points, so it is
  // offered a minute or two after the airplane has come to rest.
  const logged = page.getByRole("dialog", { name: "Flight Logged" });
  const offered = await logged
    .waitFor({ timeout: 4 * 60_000 })
    .then(() => true)
    .catch(() => false);
  const field = async (label: string) =>
    offered
      ? await logged
          .getByLabel(label, { exact: true })
          .first()
          .inputValue()
          .catch(() => "")
      : "";
  const landings = Number((await field("Day")) || 0) + Number((await field("Night, Full Stop")) || 0);
  const route = await field("Route");
  await page.waitForTimeout(65_000); // flying mode ends a minute on the ground
  const wakeAfter = await readWake(page);

  const ex = scenario.expect;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean | null, detail: string) => {
    checks.push({ name, ok, detail });
    if (ok !== null) expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };
  check("the simulator's fixes reached the page", work.length > 60, `${work.length + 1} fixes`);
  check(
    "the next checkpoint was shown in the air",
    flyingFixes ? headShown / flyingFixes >= 0.9 : null,
    `${headShown} of ${flyingFixes} fixes in flight`,
  );
  check("the next checkpoint only moved on", new Set(names).size === names.length && names.length >= 3, names.join(" > "));
  const order = (ex.checkpoints ?? []).filter((c) => names.some((n) => n.toUpperCase().includes(c)));
  check(
    "the expected checkpoints came in order",
    ex.checkpoints ? order.length === ex.checkpoints.length : null,
    `${order.length} of ${ex.checkpoints?.length ?? 0}: ${order.join(", ")}`,
  );
  check(
    "the distance to the next checkpoint came down",
    nearer.length ? nearer.filter(Boolean).length / nearer.length >= 0.8 : null,
    `${nearer.filter(Boolean).length} of ${nearer.length}`,
  );
  for (const want of ex.alerts ?? []) {
    const found = answers.some(
      (a) =>
        want.phases.includes(a.phase) &&
        a.alerts.some((x) => x.kind === want.kind && (x.class ?? "") === want.class && x.name.toUpperCase().includes(want.name)),
    );
    check(`the planner found ${want.name} class ${want.class} ahead in ${want.phases.join("/")}`, found, `${answers.length} answers`);
  }
  const heard = said.filter((s) => s.banner?.toLowerCase().includes(s.expected)).length;
  check(
    "what the planner found ahead was said over the map",
    said.length ? heard / said.length >= 0.9 : null,
    `${heard} of ${said.length}`,
  );
  const kinds = [...new Set(answers.flatMap((a) => a.alerts.map((x) => x.kind)))];
  check("TFRs, terrain and obstacles ahead (as the FAA's data has them today)", null, kinds.join(", ") || "none ahead");
  check("the scripted traffic was drawn about the map", scenario.traffic.length ? trafficDrawn : null, `${trafficAsks} traffic asks`);
  check("the screen was kept on while flying", flyingFixes ? wakeHeld / flyingFixes >= 0.95 : null, `${wakeHeld} of ${flyingFixes} fixes`);
  check(
    "the screen was let go on the ground",
    wakeAfter.taken ? wakeAfter.held === 0 : null,
    `${wakeAfter.taken} taken, ${wakeAfter.held} held`,
  );
  check("the flight was offered for the logbook", offered, offered ? "Flight Logged" : "not offered in 4 minutes");
  check("with its landings", offered && ex.landings != null ? landings === ex.landings : null, `${landings} of ${ex.landings ?? "?"}`);
  check("and its route", offered && ex.route_has ? ex.route_has.every((r) => route.includes(r)) : null, route || "none");
  const steady = work.slice(WARM_FIXES);
  const budgets = ex.budgets ?? {};
  const engineP95 = percentile(
    steady.map((w) => w.engine),
    95,
  );
  const mutationsP95 = percentile(
    steady.map((w) => w.mutations),
    95,
  );
  check(
    "the engine's calls a fix (p95)",
    budgets.engine_calls_per_fix_p95 != null ? engineP95 <= budgets.engine_calls_per_fix_p95 : null,
    `${engineP95} of ${budgets.engine_calls_per_fix_p95 ?? "-"}`,
  );
  check(
    "the DOM's mutations a fix (p95)",
    budgets.mutations_per_fix_p95 != null ? mutationsP95 <= budgets.mutations_per_fix_p95 : null,
    `${mutationsP95} of ${budgets.mutations_per_fix_p95 ?? "-"}`,
  );
  for (const [rule, most] of Object.entries(budgets.rule_per_fix ?? {})) {
    const each = (byRule[rule] ?? 0) / Math.max(1, work.length);
    check(`${rule} a fix`, each <= most, `${each.toFixed(3)} of ${most}`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, "results.json"),
    JSON.stringify(
      {
        name: scenario.name,
        fixes: work.length + 1,
        checks,
        perFix: { engine: work.map((w) => w.engine), mutations: work.map((w) => w.mutations), byRule },
        nextNames: names,
      },
      null,
      2,
    ),
  );
});
