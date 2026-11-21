// A load test of 50 pilots at once on the common journeys, with k6
// (https://k6.io), through the gateway as the apps reach it: open the map
// (the chart's cycle, the airports in view, a screenful of chart tiles),
// plan a route (the course, the checkpoints, the nav log) and read its
// Brief. Each pilot pauses between steps as a person does. It replaced
// plan.js, five pilots on the route alone (the ops audit, 2026-11-21).
//
// Run it after the wave is live, the stack up (go-live.sh --up), on a
// quiet Mac (docs/RUNBOOKS.md, "Load"):
//
//   scripts/dev/one-at-a-time.sh --alone "load test" \
//     docker run --rm -i --add-host=host.docker.internal:host-gateway \
//       -e BASE_URL=http://host.docker.internal:8080 grafana/k6:1.3.0 run - < infra/load-tests/pilots.js
//
// PILOTS (50) and HOLD (5m) set how many and for how long at the top; they
// come in over a minute and leave over half of one. The thresholds are
// what a pilot would call slow, each journey's 95th percentile; k6 exits
// non-zero when one is missed or over 1% of requests fail. The planner
// caches a route's work for 15 minutes, so each route's first pass is the
// cold one (seen in the maximum) and the rest warm. Not part of CI: it
// asks aviationweather.gov and the FAA through the planner on a cold
// cache, and the numbers are this machine's.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const PILOTS = Number(__ENV.PILOTS || 50);
const PLANNER = `${BASE}/api/planner`;

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

export const options = {
  scenarios: {
    pilots: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: PILOTS },
        { duration: __ENV.HOLD || "5m", target: PILOTS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    map_open_ms: ["p(95)<1500"],
    tile_ms: ["p(95)<800"],
    course_ms: ["p(95)<1000"],
    checkpoints_ms: ["p(95)<4000"],
    navlog_ms: ["p(95)<6000"],
    brief_ms: ["p(95)<5000"],
  },
};

const times = {
  map: new Trend("map_open_ms", true),
  tile: new Trend("tile_ms", true),
  course: new Trend("course_ms", true),
  checkpoints: new Trend("checkpoints_ms", true),
  navlog: new Trend("navlog_ms", true),
  brief: new Trend("brief_ms", true),
};

function get(url, name, trend) {
  const res = http.get(url, { tags: { name }, timeout: "180s" });
  check(res, { [`${name} answered`]: (r) => r.status === 200 });
  if (trend) trend.add(res.timings.duration);
  return res;
}

// A screenful: a 4 by 3 block of tiles around the field, asked all at
// once, as MapLibre asks for them.
function screenful(cycle, revision, zoom, x, y) {
  const asks = [];
  for (let dx = -2; dx < 2; dx++) {
    for (let dy = -1; dy < 2; dy++) {
      const url = `${PLANNER}/chart-tile/sec/${zoom}/${x + dx}/${y + dy}.png?c=${cycle}&r=${revision}`;
      asks.push(["GET", url, null, { tags: { name: "tile" }, timeout: "60s" }]);
    }
  }
  for (const res of http.batch(asks)) {
    // A tile with nothing on it is a 204; either is an answer.
    check(res, { "tile answered": (r) => r.status === 200 || r.status === 204 });
    times.tile.add(res.timings.duration);
  }
}

export default function () {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];

  group("open the map", () => {
    const started = Date.now();
    const chart = get(`${PLANNER}/chart`, "chart");
    const [south, west, north, east] = route.box;
    get(`${PLANNER}/airports/in-view?south=${south}&west=${west}&north=${north}&east=${east}`, "airports in view");
    times.map.add(Date.now() - started);
    const info = chart.status === 200 ? chart.json() : {};
    for (const [zoom, x, y] of route.tiles) {
      screenful(info.chart_cycle || "current", info.chart_revision || 0, zoom, x, y);
      sleep(1 + Math.random() * 2);
    }
  });

  group("plan the route", () => {
    get(`${PLANNER}/course?${route.query}`, "course", times.course);
    get(`${PLANNER}/checkpoints?${route.query}`, "checkpoints", times.checkpoints);
    sleep(2 + Math.random() * 3);
    get(`${PLANNER}/navlog?${route.query}`, "navlog", times.navlog);
  });

  sleep(3 + Math.random() * 5);
  group("read the Brief", () => {
    get(`${PLANNER}/briefing?${route.query}`, "brief", times.brief);
  });

  sleep(5 + Math.random() * 10);
}
