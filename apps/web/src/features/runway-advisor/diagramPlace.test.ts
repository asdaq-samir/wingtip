import { describe, expect, it } from "vitest";
import type { AirportPlace } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import type { RunwayProximityInput } from "../../lib/engine/contract";
import proximityCases from "../../lib/fixtures/runwayProximity.json";
import type { Fix } from "../../lib/map/position/ownShip";
import { adviceOf, graticuleOf, hotSpotsOf, markOf } from "./diagramPlace";
import type { DiagramText } from "./diagramText";

/** KRFD's diagram as its labels are placed (the engine's diagram test):
 *  latitudes down the right edge, longitudes along the foot, north up;
 *  and a hot spot's label on the page. */
const PAGE: DiagramText = {
  width: 396,
  height: 612,
  items: [
    { text: "42°13'N", x: 345.9, y: 76.4 },
    { text: "42°12'N", x: 345.9, y: 248.6 },
    { text: "42°11'N", x: 345.5, y: 421.7 },
    { text: "89°07'W", x: 60.0, y: 533.6 },
    { text: "89°06'W", x: 196.0, y: 533.6 },
    { text: "89°05'W", x: 332.0, y: 533.6 },
    { text: "HS 1", x: 128.0, y: 300.0 },
    { text: "RWY 1-19", x: 150.0, y: 200.0 },
  ],
};

const NOW = 1_000_000;
const fix = (f: Partial<Fix> = {}): Fix => ({
  lat: 42.2,
  lon: -89.1,
  accuracyM: 5,
  headingDeg: 10,
  speedKt: 12,
  altitudeFt: null,
  at: NOW - 1000,
  ...f,
});

describe("own ship on the airport diagram", () => {
  const graticule = graticuleOf(PAGE)!;

  it("is placed by the page's labels, north up, turned to the track", () => {
    expect(graticule.north_deg).toBe(0);
    const mark = markOf(fix(), PAGE, graticule, NOW)!;
    expect(mark.x).toBeGreaterThan(0.3);
    expect(mark.x).toBeLessThan(0.6);
    expect(mark.rotationDeg).toBe(10);
    // Stopped, a circle with no track (AC 120-76D 11.17.2.2).
    expect(markOf(fix({ speedKt: 0 }), PAGE, graticule, NOW)!.rotationDeg).toBeNull();
  });

  it("goes once the fix is older than 3 s or coarser than 30 m (AC 120-76D 11.17.2.3, 11.17.2.4)", () => {
    expect(markOf(fix({ at: NOW - 3000 }), PAGE, graticule, NOW)).not.toBeNull();
    expect(markOf(fix({ at: NOW - 3100 }), PAGE, graticule, NOW)).toBeNull();
    expect(markOf(fix({ accuracyM: 31 }), PAGE, graticule, NOW)).toBeNull();
  });

  it("rings the hot spots its labels name, on the page and the ground", () => {
    const [spot, ...rest] = hotSpotsOf(PAGE, graticule);
    expect(rest).toHaveLength(0);
    expect(spot!.name).toBe("HS 1");
    expect(spot!.x).toBeCloseTo(128 / 396);
    expect(spot!.lat).toBeGreaterThan(42.18);
    expect(spot!.lat).toBeLessThan(42.2);
    expect(hotSpotsOf(PAGE, null)).toEqual([]);
  });
});

describe("the runway advisor", () => {
  // A runway 1-19 laid north and south through the fix, 100 ft wide.
  const place = {
    elevation_ft: 742,
    pattern: null,
    runways: [
      {
        width_ft: 100,
        closed: false,
        runway_ends: [
          { ident: "01", lat: 42.19, lon: -89.1 },
          { ident: "19", lat: 42.21, lon: -89.1 },
        ],
      },
    ],
  } as unknown as AirportPlace;

  it("says the runway rolled along", () => {
    const advice = adviceOf(fix({ headingDeg: 5, speedKt: 40 }), place, [], NOW)!;
    expect(advice.state).toBe("on_runway");
    expect(advice.shown).toBe("On runway 1");
  });

  it("says nothing from an old fix, and nothing with none", () => {
    expect(adviceOf(fix({ at: NOW - 5000 }), place, [], NOW)!.state).toBe("no_fix");
    expect(adviceOf(null, place, [], NOW)).toBeNull();
  });
});

describe("the advisor's shared cases (lib/fixtures/runwayProximity.json, the engine's too)", () => {
  it.each(proximityCases.cases)("$why", (c) => {
    expect(callEngine("runway_proximity", c.input as RunwayProximityInput)).toMatchObject(c.expected);
  });
});
