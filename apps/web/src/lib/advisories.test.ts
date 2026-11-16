import { describe, expect, it } from "vitest";
import {
  faaWords,
  gairmetAltitudes,
  gairmetTitle,
  pirepConditions,
  sigmetHazard,
  suaAltitudes,
  tfrAltitudes,
  tfrPurpose,
  tfrTimes,
  titleCase,
} from "./advisories";
import { clockTime, zoneName, zuluTime } from "./format";
import faaWordsCases from "./fixtures/faaWords.json";

const gairmet = {
  hazard: "Icing",
  severity: "MOD",
  due_to: "ICE",
  valid_at: null,
  altitude_low_ft: null,
  from_freezing_level: true,
  altitude_high_ft: 22000,
};

describe("advisories in words", () => {
  it("a G-AIRMET's hazard, how bad, and how high", () => {
    expect(gairmetTitle(gairmet)).toBe("Icing, moderate");
    expect(gairmetAltitudes(gairmet)).toBe("Freezing level to 22,000 ft");
    expect(gairmetAltitudes({ ...gairmet, from_freezing_level: false, altitude_low_ft: 5000, altitude_high_ft: 18000 })).toBe(
      "5,000 to 18,000 ft",
    );
    expect(gairmetAltitudes({ ...gairmet, hazard: "IFR conditions", from_freezing_level: false, altitude_high_ft: null })).toBeNull();
  });

  it("a PIREP's turbulence and icing", () => {
    const pirep = { altitude_ft: 7000, along_track_nm: 12, urgent: false, turbulence: "MOD", icing: "NEG" };
    expect(pirepConditions(pirep)).toBe("Turbulence moderate · No icing");
    expect(pirepConditions({ ...pirep, turbulence: null, icing: null })).toBeNull();
  });

  it("a TFR's altitudes and times", () => {
    expect(tfrAltitudes({ floor_ft: 0, floor_ref: "MSL", ceiling_ft: 10000, ceiling_ref: "MSL" })).toBe("Surface to 10,000 ft MSL");
    expect(tfrAltitudes({ floor_ft: 0, floor_ref: "AGL", ceiling_ft: 400, ceiling_ref: "AGL" })).toBe("Surface to 400 ft AGL");
    expect(tfrTimes({ effective: null, expires: null })).toBeNull();
    // On this device's clock with its zone, UTC beside it (WEB-9), each
    // end's zone its own; the test's zone is whatever the machine's is.
    const local = (iso: string, year = false) => {
      const d = new Date(iso);
      const day = `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]
      }${year ? ` ${d.getFullYear()}` : ""}`;
      return { day, clock: `${clockTime(d)} ${zoneName(d)} (${zuluTime(d)})` };
    };
    const now = new Date("2026-10-01T12:00:00Z");
    const from = local("2026-10-06T18:00:00Z");
    const to = local("2026-10-08T00:30:00Z");
    expect(tfrTimes({ effective: "2026-10-06T18:00:00Z", expires: "2026-10-08T00:30:00Z" }, now)).toBe(
      `${from.day}, ${from.clock} – ${to.day}, ${to.clock}`,
    );
    expect(tfrTimes({ effective: "2026-10-06T18:00:00Z", expires: "2026-10-08T00:30:00Z" }, now)).toContain("(1800Z)");
    expect(tfrTimes({ effective: "2026-10-01T16:00:00Z", expires: null }, now)).toMatch(/^From .* \(1600Z\) until further notice$/);
    // The owner's iPhone, 2026-11-14: TFR 6/4116 ran into next year with
    // no year said. Either end in another year, both say theirs.
    const nov = local("2026-11-01T07:00:00Z", true);
    const mar = local("2027-03-14T06:59:00Z", true);
    expect(tfrTimes({ effective: "2026-11-01T07:00:00Z", expires: "2027-03-14T06:59:00Z" }, new Date("2026-11-14T12:00:00Z"))).toBe(
      `${nov.day}, ${nov.clock} – ${mar.day}, ${mar.clock}`,
    );
  });

  it("a TFR's purpose, else its rule in words with the regulation", () => {
    expect(tfrPurpose({ purpose: null, rule: "special security instructions (99.7)" })).toBe("Special security instructions, 14 CFR 99.7");
    expect(tfrPurpose({ purpose: "VIP MOVEMENT", rule: "VIP movement (91.141)" })).toBe("VIP movement");
    expect(tfrPurpose({ purpose: null, rule: null })).toBeNull();
  });
});

describe("suaAltitudes", () => {
  it("a special-use area's limits as the chart writes them", () => {
    expect(suaAltitudes({ floor_ft: 0, floor_ref: "SFC", ceiling_ft: 18000, ceiling_ref: "MSL" })).toBe("Surface to 18,000 ft");
    expect(suaAltitudes({ floor_ft: 8000, floor_ref: "MSL", ceiling_ft: 18000, ceiling_ref: "STD" })).toBe("8,000 ft to FL180");
    expect(suaAltitudes({ floor_ft: 500, floor_ref: "AGL", ceiling_ft: null, ceiling_ref: null })).toBe("500 ft AGL to unstated");
  });
});

describe("the FAA's capitals in sentence case", () => {
  it("keeps the codes and the figures, and starts each sentence with a capital", () => {
    expect(faaWords("INTERMITTENT BY NOTAM 4 HOURS IN ADVANCE")).toBe("Intermittent by NOTAM 4 hours in advance");
    expect(faaWords("0700 - 2200 LOCAL, MON - FRI; OTHER TIMES BY NOTAM")).toBe("0700 - 2200 local, Mon - Fri; other times by NOTAM");
    expect(faaWords("AIR SPEED LOSS OR GAIN OF 20KTS OR MORE BELOW 2000 FT AGL")).toBe(
      "Air speed loss or gain of 20KTS or more below 2000 ft AGL",
    );
    // A cause made of contractions alone stays as the FAA wrote it.
    expect(faaWords("CIG BLW 010 VIS BLW 3SM BR FG")).toBe("CIG BLW 010 VIS BLW 3SM BR FG");
    expect(faaWords("Security: VIP movement")).toBe("Security: VIP movement");
    // A special-use area's or an airspace's name: its designator whole, its
    // class as the AIM writes it, the days still read as days.
    expect(faaWords("R-4401A")).toBe("R-4401A");
    expect(faaWords("ACTIVE IN R-5311A")).toBe("Active in R-5311A");
    expect(faaWords("CHICAGO CLASS B")).toBe("Chicago Class B");
    expect(faaWords("0800 - 1600, TUE-SAT")).toBe("0800 - 1600, Tue-Sat");
    expect(faaWords(null)).toBe("");
    // An approach's title keeps its codes (the plate's card).
    expect(faaWords("ILS OR LOC RWY 36")).toBe("ILS or LOC rwy 36");
    expect(faaWords("RNAV (GPS) Z RWY 36")).toBe("RNAV (GPS) Z rwy 36");
    expect(faaWords("VOR-A")).toBe("VOR-A");
    // A NOTAM's codes and idents kept, a NOTAM given whole as sent: the
    // engine's own cases (engine/facade/tests/wording.rs reads them too).
    for (const c of faaWordsCases.cases) expect(faaWords(c.text), c.about).toBe(c.want);
    expect(sigmetHazard("CONVECTIVE")).toBe("Convective");
    expect(sigmetHazard("MTN OBSCN")).toBe("Mountain obscuration");
    expect(sigmetHazard(null, "SIGMET")).toBe("SIGMET");
  });
});

describe("a name the FAA writes in capitals", () => {
  it("is written as a name is", () => {
    expect(titleCase("CHICAGO CLASS B")).toBe("Chicago Class B");
    expect(titleCase("ROCKFORD")).toBe("Rockford");
  });
});

describe("a place's name", () => {
  it("is spelt as a town is, each word capitalised", async () => {
    const { placeWords } = await import("./advisories");
    expect(placeWords("LA CROSSE")).toBe("La Crosse");
    expect(placeWords("EAU CLAIRE")).toBe("Eau Claire");
    expect(placeWords("STERLING/ROCKFALLS")).toBe("Sterling/Rockfalls");
    expect(placeWords("MCCOOK")).toBe("McCook");
    expect(placeWords("Madison")).toBe("Madison");
  });
});
