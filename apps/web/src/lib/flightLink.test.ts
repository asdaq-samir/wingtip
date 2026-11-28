import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressParams, loadAddress } from "./address";
import { picksOf, placeLink, planHrefOf, planeLink } from "./flightLink";

const flight = { departureIdent: "C81", destinationIdent: "KDLH", stops: ["KMSN"], cruiseAltitudeFt: 5500, altitudes: "VPBNG:4500" };

describe("a flight's picks", () => {
  it("are the address's own keys alone", () => {
    const address = new URLSearchParams("dep=C81&dest=KDLH&pattern=KMSN:18&holds=KMSN:180:L:1M:2T&view=full&altitudes=VPBNG:4500");
    expect(new URLSearchParams(picksOf(address)).toString()).toBe("pattern=KMSN%3A18&holds=KMSN%3A180%3AL%3A1M%3A2T");
    expect(picksOf(address, ["altitudes"])).toContain("altitudes=VPBNG%3A4500");
  });

  it("open a saved flight again as it was planned, its departure while still ahead", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const href = planHrefOf({ ...flight, picks: "altitude_choice=economical&procs=KDLH%3AI09", plannedFor: "2026-10-21T15:00:00Z" }, now);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("altitude_choice")).toBe("economical");
    expect(params.get("procs")).toBe("KDLH:I09");
    // The plan flown, not its cruise typed as the pilot's own.
    expect(params.has("altitude_ft")).toBe(false);
    expect(params.get("depart")).toBe("2026-10-21T15:00:00Z");
    expect(new URLSearchParams(planHrefOf({ ...flight, plannedFor: "2026-10-19T15:00:00Z" }, now).split("?")[1]).has("depart")).toBe(false);
  });

  it("fly a flight saved before its picks were kept at its altitude, as before", () => {
    expect(new URLSearchParams(planHrefOf(flight).split("?")[1]).get("altitude_ft")).toBe("5500");
  });

  it("keep a flight's fuel stops, fuel on board and rules, both ways", () => {
    // Saved from the app: the address's fuel and tanks, and the rules setting.
    const address = loadAddress("?dep=C81&dest=KDLH&stops=KMSN&fuel=KMSN&tanks=C81%3A30");
    const picks = new URLSearchParams(picksOf(addressParams({ ...address, rules: "ifr" })));
    expect(Object.fromEntries(picks)).toEqual({ fuel: "KMSN", tanks: "C81:30", rules: "ifr" });
    // Opened again, as the connector saves them too (its rules in either case).
    const href = planHrefOf({ ...flight, picks: "fuel=KMSN&tanks=C81%3A30&rules=IFR" });
    const opened = loadAddress(href.slice(href.indexOf("?")));
    expect([opened.fuel, opened.tanks, opened.rules]).toEqual(["KMSN", "C81:30", "ifr"]);
    // None written is VFR, the connector's own reading, not the last flight's.
    const none = planHrefOf({ ...flight, picks: "fuel=KMSN" });
    expect(loadAddress(none.slice(none.indexOf("?"))).rules).toBe("vfr");
  });
});

describe("the share links", () => {
  beforeEach(() => vi.stubGlobal("location", { origin: "https://wingtip.test" }));
  afterEach(() => vi.unstubAllGlobals());

  it("give one airplane the same link from its card and from a Favorite", () => {
    const card = planeLink({ hex: "a1b2c3", tail: "N12345", name: "N12345" });
    const favorite = planeLink({ hex: "a1b2c3", name: "N12345" });
    expect(card.url).toBe(favorite.url);
    expect(card.url).toMatch(/\/app\/plan\?flight=a1b2c3$/);
  });

  it("name an airplane with no address by its N-number, an airport by its ident", () => {
    expect(planeLink({ hex: null, tail: "N606FR", name: "N606FR" }).url).toMatch(/\?airplane=N606FR$/);
    expect(placeLink({ ident: "KOSH", name: "Wittman Regional" })).toEqual({
      title: "Wittman Regional",
      url: expect.stringMatching(/\/app\/plan\?place=KOSH$/),
    });
  });
});
