import { afterEach, describe, expect, test, vi } from "vitest";
import type { Course, WeatherLoop } from "../../lib/api/types";
import { keepRadar, radarTileUrls } from "./keepFlightPath";

const TEMPLATE = "https://mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-202611101200/{z}/{x}/{y}.png";
const line: [number, number][] = [
  [43.14, -89.34],
  [43.98, -88.56],
];
const course = { course_line: line } as unknown as Course;

afterEach(() => vi.unstubAllGlobals());

describe("the radar kept for the air", () => {
  test("the newest frame's tiles over the corridor, coarsest zoom first, within the cap", () => {
    const urls = radarTileUrls(TEMPLATE, line);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.length).toBeLessThanOrEqual(400);
    expect(urls[0]).toMatch(/USCOMP-N0Q-202611101200\/6\/\d+\/\d+\.png$/);
    expect(urls.every((u) => !u.includes("{"))).toBe(true);
  });

  test("fetched from the newest frame with radar, so the worker keeps them", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        return new Response(new Uint8Array(100));
      }),
    );
    const loop = {
      frames: [
        { valid: "a", radar_tiles: TEMPLATE.replace("202611101200", "202611101155") },
        { valid: "b", radar_tiles: TEMPLATE },
        { valid: "c", radar_tiles: null, satellite_tiles: "x" },
      ],
    } as unknown as WeatherLoop;
    const kept = await keepRadar(loop, course);
    expect(kept.kept).toBe(true);
    expect(kept.bytes).toBeGreaterThan(0);
    expect(kept.bytes).toBeLessThanOrEqual(fetched.length * 100);
    expect(fetched.every((u) => u.includes("202611101200"))).toBe(true);
  });
});
