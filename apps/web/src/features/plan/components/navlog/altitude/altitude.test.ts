import { describe, expect, it } from "vitest";
import type { Leg, NavLogAltitude, RouteProfile } from "../../../../../lib/api/types";
import { advisorRows } from "./plans";
import { clearanceAt } from "./clearance";
import { waypointsAlong } from "./points";

const leg = (from: string, to: string, distance_nm: number, altitude_ft: number) => ({ from, to, distance_nm, altitude_ft }) as Leg;

describe("the profile's altitude", () => {
  it("places the waypoints along the side view with the legs round them", () => {
    const legs = [leg("KAAA", "WPT1", 20, 4500), leg("WPT1", "WPT2", 20, 5500), leg("WPT2", "KBBB", 10, 5500)];
    const points = waypointsAlong(legs, 100, ["KAAA", "WPT1", "WPT2", "KBBB"], new Set(["WPT1", "WPT2"]));
    expect(points.map((p) => [p.ident, p.along_nm])).toEqual([
      ["WPT1", 40],
      ["WPT2", 80],
    ]);
    expect(points[0]!.legOut?.altitude_ft).toBe(5500);
    expect(points[1]!.legBefore?.altitude_ft).toBe(4500);
  });

  it("colours the ground red under 500 ft of clearance (14 CFR 91.119(c)) and says it in words", () => {
    const profile = {
      length_nm: 20,
      terrain: [
        { along_nm: 0, ground_ft: 900 },
        { along_nm: 20, ground_ft: 3000 },
      ],
      airspace: [],
      obstacles: [{ along_nm: 10, amsl_ft: 1500 }],
    } as RouteProfile;
    const c = clearanceAt(profile, 3500, [{ ident: "KXYZ", along_nm: 20 }])!;
    expect([c.red_from_ft, c.yellow_from_ft, c.level]).toEqual([3000, 2500, "yellow"]);
    expect(c.words).toBe("3,500 ft, terrain within 500 ft near KXYZ");
  });

  it("lists every altitude in the advisor, Fastest marked from the plans, those outside the legal ones warned of", () => {
    const nav = {
      flown: "fastest",
      altitude_ft: null,
      options: [{ kind: "fastest", steps: [{ altitude_ft: 6500 }] }],
      altitude_figures: [
        { altitude_ft: 4500, ete_min: 60, fuel_gal: 9, tailwind_kt: -5, everywhere: true },
        { altitude_ft: 6500, ete_min: 55, fuel_gal: 9.5, tailwind_kt: 8, everywhere: true },
      ],
    } as unknown as NavLogAltitude;
    const rows = advisorRows(nav, 6500);
    const at = (ft: number) => rows.find((r) => r.altitude_ft === ft)!;
    expect(at(6500)).toMatchObject({ fastest: true, flown: true, legal: true });
    expect(at(4500).economical).toBe(true);
    expect(at(5000).legal).toBe(false);
    expect(at(5000).warning).toMatch(/Outside/);
  });
});
