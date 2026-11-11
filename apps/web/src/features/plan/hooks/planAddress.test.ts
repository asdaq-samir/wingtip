import { describe, expect, it } from "vitest";
import type { FuelStopSuggestion } from "../../../lib/api/types";
import {
  altitudeChoiceOf,
  approximateOf,
  autoOf,
  departureRunways,
  directToPatch,
  landingRunways,
  renamed,
  routeBeforeDirect,
  suggestedStopAt,
} from "./planAddress";

const address = (text: string) => new URLSearchParams(text);

describe("the altitude's plan from the address", () => {
  it("is fastest unless the address names another", () => {
    expect(altitudeChoiceOf(null)).toBe("fastest");
    expect(altitudeChoiceOf("economical")).toBe("economical");
    expect(altitudeChoiceOf("sideways")).toBe("fastest");
  });
});

describe("a Direct to", () => {
  it("flies from the departure to the point and on, the route kept for Cancel", () => {
    const next = directToPatch(address("dep=C81&stops=KJVL,KMSN&dest=KDLH"), "KMSN", null);
    expect(next.get("dep")).toBe("C81");
    expect(next.get("stops")).toBe("KMSN");
    expect(next.get("direct")).toBe("KMSN");
    expect(next.get("was")).toBe("C81|KJVL,KMSN|KDLH");
  });

  it("flies from where the airplane is, with its altitude", () => {
    const next = directToPatch(address("dep=C81&dest=KDLH"), "KDLH", { lat: 42.5, lon: -88.25, altitudeFt: 4520 });
    expect(next.get("dep")).toBe("@42.5000,-88.2500,4500");
    expect(next.has("stops")).toBe(false);
  });

  it("leaves the address alone for a point not on the route", () => {
    const prev = address("dep=C81&dest=KDLH");
    expect(directToPatch(prev, "KORD", null)).toBe(prev);
  });

  it("gives the route back on Cancel, and nothing with none to cancel", () => {
    const direct = directToPatch(address("dep=C81&stops=KJVL,KMSN&dest=KDLH"), "KMSN", null);
    const back = directToPatch(direct, null, null);
    expect(back.toString()).toBe("dep=C81&stops=KJVL%2CKMSN&dest=KDLH");
    expect(routeBeforeDirect(address("dep=C81&dest=KDLH"))).toEqual({});
  });
});

describe("a field renamed", () => {
  it("is renamed at the route's ends", () => {
    const next = renamed(address("dep=ORD&dest=KMSN"), "ORD", "KORD");
    expect(next.get("dep")).toBe("KORD");
    expect(next.get("dest")).toBe("KMSN");
  });
});

describe("runways picked into the wind", () => {
  it("are those `auto` names, none for its dash", () => {
    expect([...autoOf("land:KABQ,takeoff:KEVU", null, null)]).toEqual(["land:KABQ", "takeoff:KEVU"]);
    expect(autoOf("-", "KABQ:3", null).size).toBe(0);
  });

  it("are every runway picked, in an address from before `auto`", () => {
    expect([...autoOf(null, "KABQ:3", "KEVU:24")]).toEqual(["land:KABQ", "takeoff:KEVU"]);
  });
});

describe("the runways the plan flies", () => {
  it("leaves each field by its takeoff runway, else the one landed on", () => {
    expect(departureRunways("KMSN:36,C81:24", "KMSN:18", "C81,KMSN,KDLH")).toBe("C81:24,KMSN:18");
  });

  it("lands at each field after the departure, the departure only on a round trip", () => {
    expect(landingRunways("C81:24,KMSN:36", "C81,KMSN,KDLH")).toBe("KMSN:36");
    expect(landingRunways("C81:24", "C81,KMSN,C81")).toBe("C81:24");
  });
});

describe("a field's modelled category", () => {
  it("is read from the key, none where it is blank", () => {
    expect(approximateOf("C81:MVFR,KFAM:", "C81")).toBe("MVFR");
    expect(approximateOf("C81:MVFR,KFAM:", "KFAM")).toBeNull();
    expect(approximateOf("C81:MVFR", "KDLH")).toBeNull();
  });
});

describe("a suggested stop at a field", () => {
  const suggestion = {
    departure: "C81",
    reason: "fuel",
    stops: [{ ident: "KJVL", minutes: 40, lands_with_gal: 12, added_nm: 3 }],
    choices: [{ ident: "KEFT", minutes: 45, lands_with_gal: 11, added_nm: 8 }],
  } as unknown as FuelStopSuggestion;

  it("is found among the stops and the choices, with the flight it leaves on", () => {
    expect(suggestedStopAt("KEFT", [suggestion])).toEqual({
      after: "C81",
      stop: { reason: "fuel", from: "C81", minutes: 45, landsWithGal: 11, addedNm: 8 },
    });
    expect(suggestedStopAt("KDLH", [suggestion])).toBeNull();
    expect(suggestedStopAt(null, [suggestion])).toBeNull();
  });
});
