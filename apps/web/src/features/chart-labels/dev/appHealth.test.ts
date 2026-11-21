import { describe, expect, it } from "vitest";
import { faultsByBuild, faultWords, figuresByBuild, routeWords } from "./appHealth";

describe("the owner's status page", () => {
  it("gathers a build's crashes, hangs and the rest into one row, the newest first", () => {
    const builds = faultsByBuild([
      { platform: "ios", version: "1.0 (41)", kind: "crash", count: 1, lastAt: "2026-11-19T08:00:00Z" },
      { platform: "ios", version: "1.0 (42)", kind: "crash", count: 2, lastAt: "2026-11-21T09:00:00Z" },
      { platform: "ios", version: "1.0 (42)", kind: "hang", count: 1, lastAt: "2026-11-21T10:00:00Z" },
      { platform: "ios", version: "1.0 (42)", kind: "disk", count: 3, lastAt: "2026-11-20T10:00:00Z" },
    ]);
    expect(builds.map((b) => b.version)).toEqual(["1.0 (42)", "1.0 (41)"]);
    expect(builds[0]).toMatchObject({ crashes: 2, hangs: 1, other: 3, lastAt: "2026-11-21T10:00:00Z" });
    expect(faultWords(builds[0])).toBe("2 crashes · 1 hang · 3 other");
    expect(faultWords(builds[1])).toBe("1 crash");
  });

  it("says a build's headline figures by their 75th percentile", () => {
    const [web] = figuresByBuild([
      { source: "field", version: "abc", metric: "LCP", count: 40, p50: 1200, p75: 1840, p95: 3000 },
      { source: "field", version: "abc", metric: "CLS", count: 38, p50: 0.01, p75: 0.012, p95: 0.2 },
      { source: "field", version: "abc", metric: "TTFB", count: 40, p50: 90, p75: 120, p95: 400 },
    ]);
    expect(web).toEqual({ platform: "Web", version: "abc", words: "LCP 1.8 s · CLS 0.012", reports: 40 });
    const [android] = figuresByBuild([
      { source: "android", version: "1.0 (7)", metric: "jank_ratio", count: 5, p50: 0.01, p75: 0.025, p95: 0.1 },
    ]);
    expect(android.words).toBe("Janky frames 2.5%");
  });

  it("says a route's calls, failures and times", () => {
    expect(routeWords({ route: "/api/plan", method: "GET", count: 200, errors: 3, error_rate: 0.015, p50_ms: 420, p95_ms: 2600 })).toBe(
      "200 calls · 3 failed (1.5%) · p50 420 ms · p95 2.6 s",
    );
    expect(routeWords({ route: "/api/x", method: "GET", count: 1, errors: 0, error_rate: 0, p50_ms: null, p95_ms: null })).toBe("1 call");
  });
});
