import { describe, expect, it } from "vitest";
import type { TrafficAircraft } from "../../lib/api/types";
import { arrivalOf } from "./arrival";

// An airplane at 45°N 122°W bound for a field at 45°N 121°W, east along the
// parallel: about 42.4 nm on the WGS-84 ellipsoid (the engine's distance_nm),
// so at 100 knots a little over 25 minutes.
const plane = { hex: "a00001", lat: 45, lon: -122, track_deg: 90, speed_kt: 100, pressure_altitude: false } as TrafficAircraft;
const here = { lat: 45, lon: -122 };
const to = { lat: 45, lon: -121 };

describe("an airplane's arrival at the field it is bound for", () => {
  it("is direct from where it is, at the ground speed it sends", () => {
    const at = arrivalOf(here, plane, to, 0);
    expect(at).not.toBeNull();
    const minutes = at! / 60;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(26);
  });

  it("is none below flying speed or with no speed", () => {
    expect(arrivalOf(here, { ...plane, speed_kt: 10 }, to, 0)).toBeNull();
    expect(arrivalOf(here, { ...plane, speed_kt: null }, to, 0)).toBeNull();
  });
});
