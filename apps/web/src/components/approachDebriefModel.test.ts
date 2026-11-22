import { describe, expect, test } from "vitest";
import type { ProcedureDrawing } from "../lib/api/types";
import { findApproaches, withMinimums, withTransition, type ApproachDebrief } from "./approachDebriefModel";
import { FT_PER_NM, rad, geoLoaded } from "../lib/geo";
import type { TrackPoint } from "../lib/track";
import KBUR from "../lib/fixtures/approachKbur.json";

/** One approach debriefed as the page finds it (findApproaches, the
 *  engine's approach_find): the drawing alone offered, null where the
 *  track did not fly it. */
function debriefApproach(d: ProcedureDrawing, points: TrackPoint[], options: { minimumsFt?: number } = {}): ApproachDebrief | null {
  return findApproaches([d], points, null, options.minimumsFt ?? null)[0] ?? null;
}

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const { bearingDeg, destination, distanceNm } = await geoLoaded;

// KBUR's ILS Y RWY 08 and RNAV (GPS) Z RWY 08 as the planner draws them
// from the CIFP of 1 Oct 2026 (services/planner/tests_wingtip/cifp, wingtip.procedures.procedure_drawing).
const drawings = KBUR as unknown as Record<string, ProcedureDrawing>;

// The glidepath's height at a distance from its runway: a straight line up
// from the crossing altitude at its angle, over the curved earth (the
// engine's approach::debrief::glidepath_ft, which its own tests hold).
const EARTH_FT = 6_371_000 * 3.28084;
const glidepathFt = (gp: NonNullable<ProcedureDrawing["runway_path"]>, nmOut: number) => {
  const d = nmOut * FT_PER_NM;
  return gp.ft + d * Math.tan(rad(gp.deg)) + (d * d) / (2 * EARTH_FT);
};
const ILS = drawings["I08-Y"]!;
const ILS_LAX = drawings["I08-Y:LAX"]!;
const RNAV = drawings["R08-Z"]!;
const RNAV_MIKEI = drawings["R08-Z:MIKEI"]!;

type Ll = { lat: number; lon: number };
const ll = (p: number[]): Ll => ({ lat: p[0]!, lon: p[1]! });

/**
 * A track flown along a line of points at 120 kt, a point a second: each
 * `off(nmToGo)` nm right of it (left negative) and at `alt(nmToGo)` ft,
 * nmToGo the distance left to the line's end; then `after` seconds
 * beyond it on the same course, at `afterAlt(s)` and `afterKt(s)`.
 */
function fly(
  line: Ll[],
  opts: {
    off?: (toGo: number) => number;
    alt?: (toGo: number) => number | null;
    after?: number;
    afterAlt?: (s: number) => number | null;
    afterKt?: (s: number) => number;
  } = {},
): TrackPoint[] {
  const legs = line.slice(1).map((b, i) => ({ a: line[i]!, b, nm: distanceNm(line[i]!, b) }));
  const total = legs.reduce((s, l) => s + l.nm, 0);
  const t0 = Date.parse("2026-10-30T15:00:00Z");
  const points: TrackPoint[] = [];
  const kt = 120;
  let s = 0;
  for (let along = 0; along <= total; along = (s * kt) / 3600) {
    let rest = along,
      k = 0;
    while (k < legs.length - 1 && rest > legs[k]!.nm) {
      rest -= legs[k]!.nm;
      k++;
    }
    const leg = legs[k]!;
    const course = bearingDeg(leg.a, leg.b);
    const on = destination(leg.a, course, Math.min(rest, leg.nm));
    const toGo = total - along;
    const off = opts.off?.(toGo) ?? 0;
    const p = off ? destination(on, course + (off > 0 ? 90 : -90), Math.abs(off)) : on;
    points.push({ t: t0 + s * 1000, lat: p.lat, lon: p.lon, altFt: opts.alt ? opts.alt(toGo) : null });
    s++;
  }
  const end = line[line.length - 1]!,
    course = bearingDeg(line[line.length - 2]!, end);
  let past = 0;
  for (let k = 1; k <= (opts.after ?? 0); k++) {
    past += (opts.afterKt?.(k) ?? kt) / 3600;
    const p = destination(end, course, past);
    points.push({ t: t0 + (s + k - 1) * 1000, lat: p.lat, lon: p.lon, altFt: opts.afterAlt ? opts.afterAlt(k) : null });
  }
  return points;
}

/** A procedure's way in, as a line to fly: its transition and its final,
 *  from 2 nm before its first fix on the course into it. */
function wayIn(d: ProcedureDrawing): Ll[] {
  const line: Ll[] = [];
  for (const l of d.lines) {
    if (l.role === "missed") continue;
    for (const p of l.points.map(ll)) if (!line.length || distanceNm(line[line.length - 1]!, p) > 0.001) line.push(p);
  }
  return [destination(line[0]!, bearingDeg(line[1]!, line[0]!), 2), ...line];
}
const lengthOf = (line: Ll[]) => line.slice(1).reduce((s, p, i) => s + distanceNm(line[i]!, p), 0);
const finalOf = (d: ProcedureDrawing) => wayIn({ ...d, lines: d.lines.filter((l) => l.role !== "transition") });
const gp = ILS.runway_path!;
/** The ILS flown as charted: 3,700 to SILEX, 3,000 to the glide slope,
 *  then down it to the runway. */
const onIls = (toGo: number) => Math.min(glidepathFt(gp, toGo), toGo > 11 ? 3700 : 3000);
/** A missed approach from the runway, its climb begun `wait` s past it. */
const missedAfter = (wait: number) => (s: number) => (s <= wait ? gp.ft : gp.ft + ((s - wait) * 1000) / 60);

// The debrief's tolerances, findings and their words are the engine's, each
// boundary tested there (engine/facade/tests/approach/debrief_cases.rs and
// lesson_cases.rs, on the same KBUR drawings): here, that the page's
// arguments (the drawings, the track's points, the approach picked, the
// minimums, the transitions) reach approach_find, approach_minimums and
// approach_transition, and that each answer is read back into the page's
// camelCase shape.
describe("an ILS flown as charted", () => {
  const track = fly(finalOf(ILS), { alt: onIls, after: 120, afterAlt: missedAfter(12) });

  test("is read back clean: its fit, its crossings, no point of the plan off", () => {
    const d = debriefApproach(ILS, track)!;
    expect(d).not.toBeNull();
    expect(d.fitNm).toBeLessThan(0.01);
    expect(d.findings.filter((f) => f.tone === "stop" || f.tone === "caution")).toEqual([]);
    expect(d.crossings.map((c) => c.ident)).toEqual(["SILEX", "BUDDE", "RW08"]);
    expect(d.plan.track.some((p) => p.off)).toBe(false);
  });

  test("the missed approach's start is read back in seconds after the MAP", () => {
    const d = debriefApproach(ILS, track)!;
    expect(d.outcome.kind).toBe("missed");
    expect(d.outcome.secondsAfterMap!).toBeGreaterThanOrEqual(10);
    expect(d.outcome.secondsAfterMap!).toBeLessThanOrEqual(14);
  });

  test("is found among the field's approaches, the RNAV down the same final named with it", () => {
    const found = findApproaches([RNAV, ILS], track);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe("I08-Y");
    expect(found[0]!.alsoFits).toContain("RNAV (GPS) Z RWY 08");
  });

  test("the one the pilot picked wins where two fit alike", () => {
    // Both laterally on the same final and neither's glidepath followed:
    // no altitudes.
    const flat = fly(finalOf(ILS), { after: 60 });
    expect(findApproaches([ILS, RNAV], flat, "R08-Z")[0]!.id).toBe("R08-Z");
  });
});

describe("what it flags", () => {
  test("a track that never came near the final approach fix is no approach of it", () => {
    const wide = fly(finalOf(ILS), { off: () => 2, alt: onIls });
    expect(debriefApproach(ILS, wide)).toBeNull();
    expect(findApproaches([ILS, RNAV], wide)).toEqual([]);
  });

  test("a track under a fix's altitude before it is flagged, how far under read back", () => {
    // The RNAV via MIKEI, down to 3,500 a mile and a half before SILEX's
    // 4,100 (at or above).
    const line = wayIn(RNAV_MIKEI);
    const silexToGo = lengthOf(line.slice(2));
    const alt = (toGo: number) => (toGo > silexToGo + 1.5 ? 7000 : toGo > 5.5 ? 3500 : 1200);
    const d = debriefApproach(RNAV_MIKEI, fly(line, { alt, after: 60, afterAlt: (s) => 1200 + s * 15 }))!;
    const silex = d.findings.find((f) => f.text.includes("SILEX"))!;
    expect(silex).toEqual({ tone: "stop", text: "At SILEX: 600 ft below 4,100" });
    expect(d.crossings.find((c) => c.ident === "SILEX")!.underFt).toBeCloseTo(600, 0);
  });

  test("under the pilot's minimums before a missed approach is flagged", () => {
    const d = debriefApproach(ILS, fly(finalOf(ILS), { alt: onIls, after: 60, afterAlt: missedAfter(3) }), { minimumsFt: 1000 })!;
    expect(d.findings.find((f) => f.text.startsWith("Down to"))?.tone).toBe("stop");
    // Typed again: at or above lower minimums, and the old finding gone.
    const lower = withMinimums(d, 700);
    expect(lower.findings.filter((f) => f.minimums)).toEqual([
      { tone: "ok", text: "Lowest before the MAP: 787 ft, at or above 700", minimums: true },
    ]);
  });

  test("a landing, the minimums typed after it: its outcome passed on, so not a fault", () => {
    // Landed, not missed: what 91.175(c) allows with the runway in sight. A
    // landing read back as a missed approach would be flagged here instead.
    const landing = fly(finalOf(ILS), { alt: onIls, after: 120, afterAlt: () => 727, afterKt: (s) => Math.max(5, 120 - s * 3) });
    const d = debriefApproach(ILS, landing)!;
    expect(d.outcome.kind).toBe("landed");
    expect(withMinimums(d, 1000).findings.find((f) => f.minimums)).toEqual({
      tone: "info",
      text: "Below 1,000 to land: 91.175(c) asks for the runway in sight there",
      minimums: true,
    });
  });
});

describe("what it has to go on", () => {
  test("a track with no altitudes is debriefed on its course alone", () => {
    const d = debriefApproach(ILS, fly(finalOf(ILS), { after: 60 }))!;
    expect(d.hasAltitude).toBe(false);
    expect(d.crossings.every((c) => c.altFt == null && c.underFt == null)).toBe(true);
    expect(d.outcome.kind).toBe("unknown");
    expect(d.profile.track).toEqual([]);
  });

  test("the transition flown is found among its transitions, and the vectors where none was", () => {
    const viaLax = fly(wayIn(ILS_LAX), { alt: (toGo) => (toGo > 11 ? 4600 : onIls(toGo)), after: 60, afterAlt: missedAfter(5) });
    const vectors = findApproaches([ILS], viaLax)[0]!;
    expect(vectors.transition).toBeNull();
    expect(withTransition(vectors, [ILS_LAX], viaLax).transition).toBe("LAX");
    const straightIn = fly(finalOf(ILS), { alt: onIls, after: 60, afterAlt: missedAfter(5) });
    const fromVectors = findApproaches([ILS], straightIn)[0]!;
    expect(withTransition(fromVectors, [ILS_LAX], straightIn).transition).toBeNull();
  });
});
