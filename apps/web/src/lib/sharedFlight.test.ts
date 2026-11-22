import { describe, expect, it } from "vitest";
import { airplaneOfChoice, paramsForSharedPlan, sharedLinkOf, sharedPlanLink, withoutSharedLink, type SharedPlan } from "./sharedFlight";

const PLAN: SharedPlan = {
  dep: "KMSN",
  dest: "KOSH",
  stops: ["KJVL"],
  altitudeFt: 3500,
  depart: "2026-11-10T15:00:00.000Z",
  type: "C172",
  rules: "vfr",
  tail: null,
  tanks: {},
};

describe("a shared flight's link", () => {
  it("carries the plan and reads back as it was sent", () => {
    const url = sharedPlanLink(PLAN, "https://wingtipmaps.app");
    expect(url).toBe(
      "https://wingtipmaps.app/app/plan?open=shared&dep=KMSN&dest=KOSH&stops=KJVL&altitude_ft=3500&depart=2026-11-10T15%3A00%3A00.000Z&type=C172&rules=vfr",
    );
    expect(sharedLinkOf(new URL(url).searchParams)).toEqual({ kind: "plan", plan: PLAN });
  });

  it("sends the N-number only where it is given", () => {
    expect(sharedPlanLink(PLAN, "")).not.toContain("tail=");
    expect(sharedPlanLink({ ...PLAN, tail: "n123ab" }, "")).toContain("tail=N123AB");
  });

  it("carries the fuel set on a gauge, and leaves out a part that is not an ident and whole gallons", () => {
    const url = sharedPlanLink({ ...PLAN, tanks: { KMSN: 30, KJVL: 0 } }, "");
    expect(new URL(url, "https://x").searchParams.get("tanks")).toBe("KMSN:30,KJVL:0");
    expect(sharedLinkOf(new URL(url, "https://x").searchParams)).toMatchObject({ plan: { tanks: { KMSN: 30, KJVL: 0 } } });
    const wary = sharedLinkOf(new URLSearchParams("open=shared&dep=KMSN&dest=KOSH&tanks=KMSN:12.5,<b>:3,KJVL:-1,KOSH:20"));
    expect(wary).toMatchObject({ plan: { tanks: { KOSH: 20 } } });
  });

  it("is a saved flight's by its token", () => {
    expect(sharedLinkOf(new URLSearchParams("open=shared&share=abcdefghijklmnopqrstuv"))).toEqual({
      kind: "saved",
      token: "abcdefghijklmnopqrstuv",
    });
    expect(sharedLinkOf(new URLSearchParams("open=shared&share=x"))).toBeNull();
  });

  it("is no shared flight without open=shared or a route", () => {
    expect(sharedLinkOf(new URLSearchParams("dep=KMSN&dest=KOSH"))).toBeNull();
    expect(sharedLinkOf(new URLSearchParams("open=shared&dep=KMSN"))).toBeNull();
  });

  it("drops what is not an ident, a height or a time", () => {
    const link = sharedLinkOf(new URLSearchParams("open=shared&dep=KMSN&dest=KOSH&stops=KJVL,<b>&altitude_ft=abc&depart=soon&rules=spvfr"));
    expect(link).toEqual({
      kind: "plan",
      plan: { dep: "KMSN", dest: "KOSH", stops: ["KJVL"], altitudeFt: null, depart: null, type: null, rules: null, tail: null, tanks: {} },
    });
  });

  it("comes off the address, the receiver's own keys kept", () => {
    const kept = withoutSharedLink(new URLSearchParams("open=shared&dep=KMSN&dest=KOSH&altitude_ft=3500&layers=wx"));
    expect(kept.toString()).toBe("layers=wx");
  });
});

describe("a shared plan used", () => {
  it("is its route and altitude, and its departure only while ahead", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(paramsForSharedPlan(PLAN, now).toString()).toBe(
      "dep=KMSN&dest=KOSH&stops=KJVL&altitude_ft=3500&depart=2026-11-10T15%3A00%3A00.000Z",
    );
    expect(paramsForSharedPlan(PLAN, Date.parse("2026-11-11T00:00:00Z")).has("depart")).toBe(false);
  });

  it("sets the sender's fuel on the receiver's gauges", () => {
    expect(paramsForSharedPlan({ ...PLAN, tanks: { KJVL: 0 } }).get("tanks")).toBe("KJVL:0");
  });
});

describe("the airplane sent", () => {
  it("is the type and N-number of the one picked", () => {
    expect(airplaneOfChoice({ label: "N123AB · C172" })).toEqual({ type: "C172", tail: "N123AB" });
    expect(airplaneOfChoice({ label: "C172 · Cessna 172" })).toEqual({ type: "C172", tail: null });
    expect(airplaneOfChoice({ label: "", none: true })).toEqual({ type: null, tail: null });
  });
});
