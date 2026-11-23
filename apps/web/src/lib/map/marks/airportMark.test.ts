import { describe, expect, it } from "vitest";
import type { AirspaceClass } from "../../preferences";
import { airportMarkSvg } from "./airportMark";

describe("airportMarkSvg", () => {
  it("escapes the class and use it is handed, which come from the planner's JSON", () => {
    // The security reviews of 2026-11-21 (L17): typed B to G, but read as
    // sent, so a quote in it would have ended the attribute and written markup.
    const space = '"><img src=x onerror=alert(1)>' as unknown as AirspaceClass;
    const use = '"><b>' as unknown as "private";
    const svg = airportMarkSvg(space, "#00ff00", use, "mark");
    expect(svg).not.toContain("<img");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain('data-airspace="&quot;&gt;&lt;img');
  });

  it("writes a plain class and use as they are", () => {
    const svg = airportMarkSvg("C", "#00ff00", "private", "mark");
    expect(svg).toContain('data-airspace="C"');
    expect(svg).toContain('data-use="private"');
  });
});
