import { describe, expect, it } from "vitest";
import type { PastFlightSummary, TrafficAircraft } from "../../lib/api/types";
import { statusLine } from "./airplaneStatus";

const NOW = 1_794_600_000_000;
const KPWK = { ident: "KPWK", name: "Chicago Executive Airport", city: "Chicago", region: "US-IL" };
const landed: PastFlightSummary = {
  id: 1,
  origin: KPWK,
  destination: KPWK,
  off: NOW / 1000 - 4 * 3600,
  on: NOW / 1000 - 2 * 3600,
  landed: true,
  in_air: false,
  max_alt_ft: 3500,
};
const PLANE: TrafficAircraft = { hex: "a89c1e", lat: 42, lon: -88, pressure_altitude: false, altitude_ft: 4500, speed_kt: 112 };

describe("the airplane card's status line", () => {
  it("says it is in the air from the live find, before anything its flights say", () => {
    expect(statusLine({ state: "flying", plane: PLANE }, [landed], NOW).text).toBe("In the air · 4,500 ft · 112 kt");
  });

  it("says it is being checked while the live find is out", () => {
    expect(statusLine({ state: "checking" }, [landed], NOW).text).toBe("Checking whether it's in the air…");
  });

  it("on the ground, says where its last flight landed and how long ago", () => {
    expect(statusLine({ state: "ground" }, [landed], NOW).text).toBe("On the ground · landed KPWK 2h ago");
    expect(statusLine({ state: "ground" }, [landed], NOW)).toMatchObject({ badge: "ground", rest: "landed KPWK 2h ago" });
  });

  it("says none was heard in the archive where no flight was found, and nothing more while they are looked for", () => {
    expect(statusLine({ state: "ground" }, [], NOW).text).toBe("Not heard in the last 6 weeks");
    expect(statusLine({ state: "ground" }, undefined, NOW).text).toBe("Not in the air now");
  });
});
