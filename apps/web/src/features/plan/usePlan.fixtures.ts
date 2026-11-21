/** usePlan.test's route, its plan's asks and a signed-in pilot. */
import type { Course } from "../../lib/api/types";
import type { PlanParams } from "./planQuery";

export function courseFixture(): Course {
  return {
    departure: { ident: "C81", name: "Campbell", lat: 42.1, lon: -88.1, elevation_ft: 890, kind: "airport" },
    destination: { ident: "KDLH", name: "Duluth", lat: 46.8, lon: -92.2, elevation_ft: 1428, kind: "airport" },
    stops: [],
    distance_nm: 323.4,
    bearing_deg: 328,
    course_line: [
      [42.1, -88.1],
      [46.8, -92.2],
    ],
    checkpoints_ready: false,
    max_zoom: 12,
    min_zoom: 4,
    chart_cycle: "09-03-2026",
    chart_revision: 0,
    chart_tiles_base: null,
    chart_layers: [],
  };
}

export const params: PlanParams = {
  dep: "C81",
  dest: "KDLH",
  stops: [],
  altitudeFt: "",
  altitudeChoice: "lowest",
  depart: "",
  aircraft: { profile: "c172", label: "Cessna 172" },
  load: 0,
  // The map's Checkpoints on: the plan these tests are about finds them.
  checkpoints: true,
};

export const signedIn = {
  id: 7,
  displayName: "A. Pilot",
  email: "a@example.com",
  developer: false,
  fullName: null,
  phone: null,
  homeBase: null,
  avatarUrl: null,
};
