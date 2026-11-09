import { describe, expect, it } from "vitest";
import type { FlowProgram, ItwsProduct, SaaStatus } from "./api/types";
import { itwsLines, liveWhen, programLine, saaWords, zulu } from "./liveReports";
import { verdictItems, type VerdictInput } from "./verdict";

const quiet: VerdictInput = {
  weather: { pending: false, failed: null, vfrNotRecommended: [], underMinimums: [], hazards: [], unchecked: [], worst: "3,500 ft · 6 sm" },
  airspace: { pending: false, unchecked: false, inForce: [], near: 0, specialUse: [] },
  altitude: { pending: false, problem: null, cautions: [], flown: "FL055 · Lowest" },
  fuel: { pending: false, marginGal: 12.4, requiredGal: 27.6, reserveMin: 30 },
  runways: { pending: false, worked: true, short: [], crosswind: [], beyond: [], unchecked: [] },
  balance: { pending: false, worked: true, problems: [], takeoff: "2,407 lb at 41.2 in" },
  risk: { level: "low", line: "Low · 2 points" },
};
const finding = (input: VerdictInput, key: string) => verdictItems(input).find(i => i.key === key)!;

// 2026-11-09 21:30Z.
const AT_2130 = Date.UTC(2026, 10, 9, 21, 30) / 1000;
const microburst: ItwsProduct = {
  airport: "ATL", product: "9840", name: "Configured Alerts Product", expires: AT_2130, heard: AT_2130 - 60,
  alerts: [{ alert: "microburst", words: "Runway 27L arrival microburst alert 40 kt, 3 mile final to runway", runway: "27L", direction: "arrival", value_kt: 40 }],
};
const groundStop = { airport: "EWR", program: "ground stop", restriction: false, ends: AT_2130, average_delay_min: 45, heard: 0 } as FlowProgram;

describe("what SWIM says now", () => {
  it("says an ITWS alert with its airport and the Go / No-Go cautions on it, saying its source", () => {
    const lines = itwsLines([microburst]);
    expect(lines).toEqual(["ATL: Runway 27L arrival microburst alert 40 kt, 3 mile final to runway"]);
    const item = finding({ ...quiet, weather: { ...quiet.weather, terminalAlerts: lines } }, "weather");
    expect(item).toMatchObject({ finding: "caution", detail: `${lines[0]} (FAA ITWS, now)` });
  });

  it("says a ground stop in a line, a finding under IFR only", () => {
    expect(zulu(AT_2130)).toBe("2130Z");
    expect(programLine(groundStop)).toBe("Ground stop at EWR until 2130Z, delays average 45 min");
    expect(programLine({ ...groundStop, restriction: true, program: null })).toBeNull();
    const flowPrograms = [programLine(groundStop)!];
    expect(finding({ ...quiet, weather: { ...quiet.weather, flowPrograms } }, "weather").finding).toBe("ok");
    expect(finding({ ...quiet, weather: { ...quiet.weather, flowPrograms, ifr: true } }, "weather").detail)
      .toBe("Ground stop at EWR until 2130Z, delays average 45 min (FAA Command Center)");
  });

  it("gives SFDPS's word for an area at the pass, the schedule's where it says nothing of then", () => {
    const active: SaaStatus = { designator: "R4401A", active: true, until: AT_2130, heard: 0 };
    const before = new Date((AT_2130 - 600) * 1000);
    const after = new Date((AT_2130 + 600) * 1000);
    expect(liveWhen("not-scheduled", active, before)).toBe("active-now");
    expect(liveWhen("not-scheduled", active, after)).toBe("not-scheduled");
    expect(liveWhen("active", { ...active, active: false, until: null }, before)).toBe("cold-now");
    expect(liveWhen("by-notam", undefined, before)).toBe("by-notam");
    expect(saaWords(active)).toBe("Active now until 2130Z (FAA SFDPS)");
    expect(finding({ ...quiet, airspace: { ...quiet.airspace, specialUse: [{ name: "R-4401A", when: "active-now" }] } }, "airspace").detail)
      .toBe("R-4401A active now (FAA SFDPS)");
  });
});
