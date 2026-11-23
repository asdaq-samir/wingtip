// Pilots at once on the common journeys, with k6 (https://k6.io), through
// the gateway as the apps reach it: sign in by the emailed link, open the
// map (the chart's cycle, the airports in view, a screenful of chart
// tiles), plan a route (the course, the checkpoints, the nav log), read
// its Brief and the saved flights. Each pilot pauses between steps as a
// person does. It replaced plan.js, five pilots on the route alone (the
// ops audit, 2026-11-21).
//
// PROFILE picks the shape, all on the same journeys and limits
// (docs/TESTING-AFTER-MERGE.md):
//   load    50 pilots (PILOTS) in over a minute, held 5 min (HOLD)
//   stress  10, 25, 50, 100, 150, 200, 300, 400, 500 pilots, each step
//           reached in 30 s and held STEP_HOLD (2m); every limit is
//           judged per step (the `step` tag), and k6 stops once a step's
//           errors pass 10%: the step before the first broken one is the
//           breaking point
//   soak    50 pilots held SOAK_HOLD (2h)
//   spike   0 to 200 in 10 s, held a minute, back to 10 in 10 s and 3 min
//           there, to see the stack come back
//
// Run by scripts/dev/after-merge.sh (stack capped as a t3a.large), or by
// hand on a quiet Mac with the folder mounted (docs/RUNBOOKS.md, "Load"):
//
//   scripts/dev/one-at-a-time.sh --alone "load test" \
//     docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/infra/load-tests:/s:ro" \
//       -e BASE_URL=http://host.docker.internal:8080 grafana/k6:1.3.0 run /s/pilots.js
//
// TILE_URL sends the chart tiles straight to the planner (its /api), as
// production's Caddy does (infra/server/Caddyfile, @tiles); unset, through
// the gateway. MAILPIT_URL (and MAILPIT_AUTH, user:password) is the local
// inbox the sign-in link is read from; SIGN_IN=0 leaves sign-in out. The
// thresholds are what a pilot would call slow, each journey's 95th
// percentile; k6 exits 99 when one is missed. SUMMARY names a JSON file
// the run's figures go to, which after-merge's report reads.
import http from "k6/http";
import exec from "k6/execution";
import encoding from "k6/encoding";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const PLANNER = `${BASE}/api/planner`;
const TILES = __ENV.TILE_URL || PLANNER;
const MAILPIT = __ENV.MAILPIT_URL || "http://localhost:8025";
const PROFILE = __ENV.PROFILE || "load";
const PILOTS = Number(__ENV.PILOTS || 50);
// Each run's addresses its own, so no address meets the gateway's
// five-links-an-hour limit twice (app.magic-link.per-address-per-hour).
const RUN = __ENV.RUN || String(Date.now());
const SIGN_IN = __ENV.SIGN_IN !== "0";

// Routes pilots plan around Chicago and the upper Midwest, with the map's
// view at each departure: the sectional tile under the field at zoom 9 and
// 10 (worked out once from its position, so no map maths lives here) and
// the box the airports in view are asked for.
const ROUTES = [
  { query: "dep=C81&dest=KDLH", box: [41.8, -88.8, 42.8, -87.4], tiles: [[9, 130, 189], [10, 261, 378]] },
  { query: "dep=KDPA&dest=KMSN", box: [41.4, -88.9, 42.4, -87.6], tiles: [[9, 130, 190], [10, 260, 380]] },
  { query: "dep=KUGN&dest=KRFD", box: [41.9, -88.6, 42.9, -87.2], tiles: [[9, 131, 189], [10, 262, 378]] },
  { query: "dep=KMSN&dest=KDLH", box: [42.6, -90.0, 43.6, -88.6], tiles: [[9, 128, 187], [10, 257, 375]] },
  { query: "dep=C81&dest=KDLH&stops=KMSN", box: [41.8, -88.8, 42.8, -87.4], tiles: [[9, 130, 189], [10, 261, 378]] },
];

// Each journey's limit: its 95th percentile in ms.
const LIMITS = {
  map_open_ms: 1500,
  tile_ms: 800,
  course_ms: 1000,
  checkpoints_ms: 4000,
  navlog_ms: 6000,
  brief_ms: 5000,
  sign_in_ms: 3000,
  saved_ms: 1000,
};
const ERRORS = 0.01;

function steps() {
  const hold = __ENV.STEP_HOLD || "2m";
  if (PROFILE === "stress") {
    return [10, 25, 50, 100, 150, 200, 300, 400, 500].map((n) => ({ name: String(n), target: n, ramp: "30s", hold }));
  }
  if (PROFILE === "soak") return [{ name: "soak", target: PILOTS, ramp: "2m", hold: __ENV.SOAK_HOLD || "2h" }];
  if (PROFILE === "spike") {
    return [
      { name: "spike", target: 200, ramp: "10s", hold: "1m" },
      { name: "after", target: 10, ramp: "10s", hold: "3m" },
    ];
  }
  return [{ name: "load", target: PILOTS, ramp: "1m", hold: __ENV.HOLD || "5m" }];
}
const STEPS = steps();

function seconds(text) {
  const n = parseFloat(text);
  return text.endsWith("h") ? n * 3600 : text.endsWith("m") ? n * 60 : n;
}

// Where each step ends, seconds from the start, for the tag.
const ENDS = [];
STEPS.reduce((t, s) => {
  ENDS.push(t + seconds(s.ramp) + seconds(s.hold));
  return ENDS[ENDS.length - 1];
}, 0);

function thresholds() {
  const t = { http_req_failed: [`rate<${ERRORS}`], "http_reqs{name:tile}": ["count>=0"] };
  for (const [metric, limit] of Object.entries(LIMITS)) t[metric] = [`p(95)<${limit}`];
  if (STEPS.length > 1) {
    for (const s of STEPS) {
      t[`http_req_failed{step:${s.name}}`] = [`rate<${ERRORS}`];
      // Not limits: each step's requests, and its tiles among them, in the
      // summary for the report's rates (k6 keeps a tag's figures only
      // where a threshold names it).
      t[`http_reqs{step:${s.name}}`] = ["count>=0"];
      t[`http_reqs{step:${s.name},name:tile}`] = ["count>=0"];
      for (const [metric, limit] of Object.entries(LIMITS)) t[`${metric}{step:${s.name}}`] = [`p(95)<${limit}`];
    }
  }
  if (PROFILE === "stress") {
    // Past this nothing more is learned: the stack is down for everyone.
    t.http_req_failed.push({ threshold: "rate<0.10", abortOnFail: true, delayAbortEval: "1m" });
  }
  return t;
}

export const options = {
  // A pilot signs in once and stays signed in: k6 empties each VU's cookie
  // jar between iterations unless told not to, so from the second round on
  // the saved flights were asked with no session (/api/me 204, /api/flights
  // 401), the flat ~3% of errors at every load in the stress run of
  // 2026-11-23 (its summary's checks: "me answered" and "flights answered"
  // failed 11,001 times each, every other check passed; the other 500
  // failures were each pilot's first /api/me, below).
  noCookiesReset: true,
  scenarios: {
    pilots: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [...STEPS.flatMap((s) => [{ duration: s.ramp, target: s.target }, { duration: s.hold, target: s.target }]), { duration: "30s", target: 0 }],
      gracefulRampDown: "2m",
    },
  },
  thresholds: thresholds(),
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
};

const times = Object.fromEntries(Object.keys(LIMITS).map((m) => [m, new Trend(m, true)]));

// The step the run is in, on every figure from here on (the VU's tags).
function stepNow() {
  const at = exec.instance.currentTestRunDuration / 1000;
  const i = ENDS.findIndex((end) => at < end);
  exec.vu.metrics.tags.step = STEPS[i < 0 ? STEPS.length - 1 : i].name;
}

function get(url, name, trend, params = {}) {
  const res = http.get(url, { tags: { name }, timeout: "180s", ...params });
  check(res, { [`${name} answered`]: (r) => r.status === 200 });
  if (trend) trend.add(res.timings.duration);
  return res;
}

function inbox(path) {
  const auth = __ENV.MAILPIT_AUTH ? { Authorization: `Basic ${encoding.b64encode(__ENV.MAILPIT_AUTH)}` } : {};
  return http.get(`${MAILPIT}${path}`, { headers: auth, tags: { name: "inbox" }, responseCallback: http.expectedStatuses(200) });
}

function xsrf() {
  const jar = http.cookieJar().cookiesForURL(BASE);
  return jar["XSRF-TOKEN"] ? decodeURIComponent(jar["XSRF-TOKEN"][0]) : "";
}

// Sign in as a person does: ask for the link, take it from the inbox,
// press Sign in (the verify POST), with the session's CSRF header as the
// app sends it. Once a pilot; the session cookie stays in the VU's jar.
let signedIn = false;
function signIn() {
  const email = `pilot-${exec.vu.idInTest}-${RUN}@load.wingtip.invalid`;
  const started = Date.now();
  // Signed out, /api/me answers 204 (it was 401 once): not an error, one a pilot.
  http.get(`${BASE}/api/me`, { tags: { name: "me" }, responseCallback: http.expectedStatuses(200, 204, 401) });
  const asked = http.post(`${BASE}/api/auth/magic-link`, JSON.stringify({ email }), {
    headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": xsrf() },
    tags: { name: "sign-in link" },
  });
  if (!check(asked, { "sign-in link asked": (r) => r.status === 202 })) return;
  let token = null;
  for (let tries = 0; tries < 20 && !token; tries++) {
    sleep(0.5);
    const found = inbox(`/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`);
    const id = found.status === 200 ? (found.json("messages") || [])[0]?.ID : null;
    if (id) token = (inbox(`/api/v1/message/${id}`).json("Text") || "").match(/magic-link\/verify\?token=([\w-]+)/)?.[1];
  }
  if (!check(token, { "sign-in link arrived": (t) => !!t })) return;
  const verified = http.post(`${BASE}/api/auth/magic-link/verify`, { token }, {
    headers: { "X-XSRF-TOKEN": xsrf() },
    redirects: 0,
    tags: { name: "sign-in verify" },
    responseCallback: http.expectedStatuses({ min: 200, max: 399 }),
  });
  signedIn = check(verified, { "signed in": (r) => r.status < 400 });
  times.sign_in_ms.add(Date.now() - started);
}

// A screenful: a 4 by 3 block of tiles around the field, asked all at
// once, as MapLibre asks for them.
function screenful(cycle, revision, zoom, x, y) {
  const asks = [];
  for (let dx = -2; dx < 2; dx++) {
    for (let dy = -1; dy < 2; dy++) {
      const url = `${TILES}/chart-tile/sec/${zoom}/${x + dx}/${y + dy}.png?c=${cycle}&r=${revision}`;
      asks.push(["GET", url, null, { tags: { name: "tile" }, timeout: "60s" }]);
    }
  }
  for (const res of http.batch(asks)) {
    // A tile with nothing on it is a 204; either is an answer.
    check(res, { "tile answered": (r) => r.status === 200 || r.status === 204 });
    times.tile_ms.add(res.timings.duration);
  }
}

export default function () {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  stepNow();
  if (SIGN_IN && !signedIn) group("sign in", signIn);

  group("open the map", () => {
    const started = Date.now();
    const chart = get(`${PLANNER}/chart`, "chart");
    const [south, west, north, east] = route.box;
    get(`${PLANNER}/airports/in-view?south=${south}&west=${west}&north=${north}&east=${east}`, "airports in view");
    times.map_open_ms.add(Date.now() - started);
    const info = chart.status === 200 ? chart.json() : {};
    for (const [zoom, x, y] of route.tiles) {
      screenful(info.chart_cycle || "current", info.chart_revision || 0, zoom, x, y);
      sleep(1 + Math.random() * 2);
    }
  });

  stepNow();
  group("plan the route", () => {
    get(`${PLANNER}/course?${route.query}`, "course", times.course_ms);
    get(`${PLANNER}/checkpoints?${route.query}`, "checkpoints", times.checkpoints_ms);
    sleep(2 + Math.random() * 3);
    get(`${PLANNER}/navlog?${route.query}`, "navlog", times.navlog_ms);
  });

  sleep(3 + Math.random() * 5);
  stepNow();
  group("read the Brief", () => {
    get(`${PLANNER}/briefing?${route.query}`, "brief", times.brief_ms);
  });

  if (signedIn) {
    group("saved flights", () => {
      get(`${BASE}/api/me`, "me", times.saved_ms);
      get(`${BASE}/api/flights`, "flights", times.saved_ms);
    });
  }
  sleep(5 + Math.random() * 10);
}

// The run's figures as JSON for the report (SUMMARY), and k6's own text.
export function handleSummary(data) {
  const out = { stdout: textSummary(data) };
  if (__ENV.SUMMARY) {
    out[__ENV.SUMMARY] = JSON.stringify({ profile: PROFILE, steps: STEPS, limits: LIMITS, errors: ERRORS, data }, null, 1);
  }
  return out;
}

function textSummary(data) {
  const lines = [`${PROFILE}: ${data.state.testRunDurationMs / 1000 | 0} s, up to ${data.metrics.vus_max?.values.max} pilots`];
  for (const [name, m] of Object.entries(data.metrics)) {
    if (m.thresholds) {
      const ok = Object.values(m.thresholds).every((t) => t.ok);
      const v = m.values;
      lines.push(`${ok ? "ok  " : "FAIL"} ${name} ${"p(95)" in v ? `p95 ${Math.round(v["p(95)"])} ms` : `rate ${(v.rate * 100).toFixed(2)}%`}`);
    }
  }
  return lines.join("\n") + "\n";
}
