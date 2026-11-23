/** The C81 to KDLH course the planner answers, for the tests of the hooks that read it. */
import type { Course } from "../lib/api/types";

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
