import { describe, expect, it } from "vitest";
import { loadAddress } from "../../../lib/address";
import type { FuelStopSuggestion } from "../../../lib/api/types";
import {
  approximateOf,
  autoOf,
  departureRunways,
  directToPatch,
  landingRunways,
  renamed,
  routeBeforeDirect,
  suggestedStopAt,
} from "./planAddress";

const address = (text: string) => loadAddress(text);

describe("the altitude's plan from the address", () => {
  it("is fastest unless the address names another", () => {
    expect(address("").altitude_choice).toBe("fastest");
    expect(address("altitude_choice=economical").altitude_choice).toBe("economical");
    expect(address("altitude_choice=sideways").altitude_choice).toBe("fastest");
  });
});

describe("a Direct to", () => {
  it("flies from the departure to the point and on, the route kept for Cancel", () => {
    const next = directToPatch(address("dep=C81&stops=KJVL,KMSN&dest=KDLH"), "KMSN", null);
    expect(next.dep).toBe("C81");
    expect(next.stops).toBe("KMSN");
    expect(next.direct).toBe("KMSN");
    expect(next.was).toBe("C81|KJVL,KMSN|KDLH");
  });

  it("flies from where the airplane is, with its altitude", () => {
    const next = directToPatch(address("dep=C81&dest=KDLH"), "KDLH", { lat: 42.5, lon: -88.25, altitudeFt: 4520 });
    expect(next.dep).toBe("@42.5000,-88.2500,4500");
    expect(next.stops).toBeNull();
  });

  it("changes nothing for a point not on the route", () => {
    expect(directToPatch(address("dep=C81&dest=KDLH"), "KORD", null)).toEqual({});
  });

  it("gives the route back on Cancel, and nothing with none to cancel", () => {
    const prev = address("dep=C81&stops=KJVL,KMSN&dest=KDLH");
    const direct = { ...prev, ...directToPatch(prev, "KMSN", null) };
    expect(directToPatch(direct, null, null)).toEqual({ dep: "C81", stops: "KJVL,KMSN", dest: "KDLH", direct: null, was: null });
    expect(routeBeforeDirect(address("dep=C81&dest=KDLH"))).toEqual({});
  });
});

describe("a field renamed", () => {
  it("is renamed at the route's ends, and only what changes is changed", () => {
    expect(renamed(address("dep=ORD&dest=KMSN"), "ORD", "KORD")).toEqual({ dep: "KORD" });
    expect(renamed(address("dep=ORD&dest=KMSN&pattern=ORD:27"), "ORD", "KORD")).toEqual({ dep: "KORD", pattern: "KORD:27" });
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
