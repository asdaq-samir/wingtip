import { describe, expect, it } from "vitest";
import type { TrafficAircraft, TrafficFound } from "../api/types";
import { inAirOf, inAirWords, liveFindQuery, registeredQuery, SEARCH_RETRIES } from "./lookup";

const PLANE: TrafficAircraft = {
  hex: "a89c1e",
  registration: "N654FL",
  lat: 42.3,
  lon: -88.1,
  pressure_altitude: false,
  altitude_ft: 4520,
  speed_kt: 108.6,
};
const found = (aircraft: TrafficAircraft[], checked = true): TrafficFound => ({
  aircraft,
  checked,
  source: "adsb.lol",
  license: "ODbL 1.0",
});
const answered = (data: TrafficFound) => ({ data, isError: false });

describe("an N-number's two answers", () => {
  it("asks the record and the live find under keys of their own", () => {
    // The record's key is the one the profile, the picker and the search share.
    expect(registeredQuery("N654FL").queryKey).toEqual(["registered", "N654FL"]);
    expect(liveFindQuery("N654FL").queryKey).toEqual(["trafficFind", "N654FL"]);
  });

  it("says it is checking until the live find answers", () => {
    const inAir = inAirOf({ isError: false, fetchStatus: "fetching" });
    expect(inAir).toEqual({ state: "checking" });
    expect(inAirWords(inAir)).toEqual({ text: "Checking whether it's in the air…", problem: false });
  });

  it("gives the one in the air with the registry's address, its height and speed", () => {
    const other = { ...PLANE, hex: "a00001", registration: "N1" };
    const inAir = inAirOf(answered(found([other, PLANE])), "A89C1E");
    expect(inAir).toEqual({ state: "flying", plane: PLANE });
    expect(inAirWords(inAir).text).toBe("In the air · 4,500 ft · 109 kt");
    // Led by the In the air badge (components/StatusBadge), its figures after it.
    expect(inAirWords(inAir)).toMatchObject({ badge: "inAir", rest: "4,500 ft · 109 kt" });
  });

  it("says not in the air where the find answered none", () => {
    expect(inAirWords(inAirOf(answered(found([])), "a89c1e"))).toEqual({ text: "Not in the air now", problem: false });
  });

  it("says adsb.lol is busy while its tries go on, and that it isn't known after them, in place", () => {
    const busy = answered(found([], false));
    expect(inAirWords(inAirOf(busy, null, 1))).toEqual({ text: "adsb.lol is busy; checking again…", problem: false });
    expect(inAirWords(inAirOf(busy, null, SEARCH_RETRIES + 1)).problem).toBe(true);
  });

  it("says a failed find as a problem, and no connection as that", () => {
    expect(inAirWords(inAirOf({ isError: true, error: new Error("500") })).text).toBe(
      "Couldn't check whether it's in the air. Try again in a moment.",
    );
    expect(inAirWords(inAirOf({ isError: false, fetchStatus: "paused" }))).toEqual({ text: "No connection", problem: true });
  });
});
