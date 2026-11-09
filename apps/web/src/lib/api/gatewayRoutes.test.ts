import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every planner and assistant endpoint the web app asks for is one the
 * gateway forwards: an operation its service marks with `x-gateway` in its
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
  return new Set(Object.entries(paths).flatMap(([path, operations]) =>
    Object.entries(operations).filter(([, operation]) => operation["x-gateway"]).map(([method]) => `${method.toUpperCase()} ${path}`)));
}

describe("the gateway", () => {
  it("forwards every planner and assistant endpoint the web app asks for", () => {
    const forwarded = {
      planner: marked("../../../../../services/planner/openapi.json"),
      assistant: marked("../../../../../services/assistant/openapi.json"),
    };
    const asked = [...read("./client.ts").matchAll(/(planner|assistant)\.(GET|POST|DELETE)\("([^"]+)"/g)]
      .map(m => ({ service: m[1] as "planner" | "assistant", call: `${m[2]} ${m[3]}` }));
    expect(asked.length).toBeGreaterThan(30);
    expect(asked.filter(({ service, call }) => !forwarded[service].has(call))).toEqual([]);
  });
});
