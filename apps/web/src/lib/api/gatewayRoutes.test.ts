import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every planner endpoint the web app asks for is one the gateway
 * forwards: an operation the planner marks with `x-gateway` in its
 * OpenAPI document (services/planner/app/gateway.py), which the gateway
 * reads to build its routes (UpstreamRoutes). An unmarked one is a 404
 * there, and the runway's forecast wind and an airplane's alert state had
 * been for as long as they were asked for, with every spec passing on its
 * own stub (2026-10-21).
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

type Document = { paths: Record<string, Record<string, { "x-gateway"?: unknown }>> };

function marked(document: string): Set<string> {
  const { paths } = JSON.parse(read(document)) as Document;
  return new Set(
    Object.entries(paths).flatMap(([path, operations]) =>
      Object.entries(operations)
        .filter(([, operation]) => operation["x-gateway"])
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    ),
  );
}

describe("the gateway", () => {
  it("forwards every planner endpoint the web app asks for", () => {
    const forwarded = marked("../../../../../services/planner/openapi.json");
    // The planner's calls, by area (./client's api).
    const areas = ["./plannerRoute.ts", "./plannerAirports.ts", "./plannerMap.ts", "./plannerDev.ts"].map(read).join("\n");
    const asked = [...areas.matchAll(/planner\.(GET|POST|DELETE)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(asked.length).toBeGreaterThan(30);
    expect(asked.filter((call) => !forwarded.has(call))).toEqual([]);
  });
});
