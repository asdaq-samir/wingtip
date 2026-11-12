// Duluth's RNAV (GPS) RWY 27 via PLANE as the planner draws it
// (wingtip.procedures, the 2026-10 cycle), stubbed: the FAA's file is not read
// on CI's runner. From PLANE, south-east of the field, north to HOMUV, and
// west down its final through CIRUS to the runway.
export const R27 = {
  airport: "KDLH",
  kind: "approach",
  id: "R27",
  name: "RNAV (GPS) RWY 27",
  transition: "PLANE",
  cycle: "261001",
  stale: false,
  lines: [
    {
      role: "transition",
      name: "PLANE",
      points: [
        [46.733597, -91.910758],
        [46.833461, -91.904417],
      ],
    },
    {
      role: "final",
      name: null,
      points: [
        [46.833461, -91.904417],
        [46.837675, -92.048269],
        [46.841361, -92.180119],
      ],
    },
    {
      role: "missed",
      name: null,
      points: [
        [46.841361, -92.180119],
        [46.842746, -92.228777],
        [46.849967, -92.511453],
      ],
    },
  ],
  holds: [],
  fixes: [
    { ident: "PLANE", lat: 46.733597, lon: -91.910758, roles: ["IAF"], min_ft: null, max_ft: null, speed_kt: null, missed: false },
    { ident: "HOMUV", lat: 46.833461, lon: -91.904417, roles: ["IF", "FACF"], min_ft: 4000, max_ft: null, speed_kt: null, missed: false },
    { ident: "CIRUS", lat: 46.837675, lon: -92.048269, roles: ["FAF"], min_ft: 3200, max_ft: null, speed_kt: null, missed: false },
    { ident: "RW27", lat: 46.841361, lon: -92.180119, roles: ["MAP"], min_ft: null, max_ft: null, speed_kt: null, missed: false },
    { ident: "UDTEG", lat: 46.849967, lon: -92.511453, roles: ["hold"], min_ft: 3300, max_ft: null, speed_kt: null, missed: true },
  ],
};
