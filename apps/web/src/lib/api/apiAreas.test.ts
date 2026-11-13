import { describe, expect, it } from "vitest";
import { api } from "./client";
import { plannerRoute } from "./plannerRoute";
import { plannerAirports } from "./plannerAirports";
import { plannerMap } from "./plannerMap";
import { plannerDev } from "./plannerDev";
import { assistantCalls } from "./assistantCalls";
import { gatewayPilot } from "./gatewayPilot";
import { gatewayRecords } from "./gatewayRecords";

describe("the api made of its areas", () => {
  it("has every area's calls, each name once: a name in two areas would hide one of them", () => {
    const names = [plannerRoute, plannerAirports, plannerMap, plannerDev, assistantCalls, gatewayPilot, gatewayRecords].flatMap(
      Object.keys,
    );
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(api).sort()).toEqual(names.sort());
  });
});
