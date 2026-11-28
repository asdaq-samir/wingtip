// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { readTrack, thin, TrackError, type TrackPoint } from "../../lib/track";

/** Flown every 5 s: two minutes' taxi, then north at 100 kt half a mile
 *  east of the line, climbing at 500 fpm to 3,600; 3,800 for two minutes
 *  on the second leg; down at 500 fpm to 1,800 in the last 4 nm; taxi. */
function flown(): TrackPoint[] {
  const t0 = Date.parse("2026-10-02T15:00:00Z");
  const lon = -88 + 0.5 / (60 * Math.cos((42.5 * Math.PI) / 180));
  const points: TrackPoint[] = [];
  for (let s = 0; s < 120; s += 5) points.push({ t: t0 + s * 1000, lat: 42 - 0.002 + (s / 3600) * (10 / 60), lon, altFt: 700 });
  const off = t0 + 120_000;
  for (let s = 0; s <= 36 * 60; s += 5) {
    const nm = (s / 3600) * 100;
    let alt = Math.min(3600, 700 + (s / 60) * 500);
    if (nm > 40 && nm < 40 + 100 / 30) alt = 3800;
    if (nm > 56) alt = Math.max(1800, 3600 - (nm - 56) * 600);
    points.push({ t: off + s * 1000, lat: 42 + nm / 60, lon, altFt: alt });
  }
  const on = off + 36 * 60_000;
  for (let s = 5; s < 120; s += 5) points.push({ t: on + s * 1000, lat: 43 + (s / 3600) * (10 / 60), lon, altFt: 700 });
  return points;
}

describe("a track read", () => {
  test("GPX's points, metres to feet, in time order", () => {
    const points = readTrack(`<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
      <trkpt lat="42.1" lon="-88.1"><ele>1000</ele><time>2026-10-02T15:00:05Z</time></trkpt>
      <trkpt lat="42.0" lon="-88.0"><ele>304.8</ele><time>2026-10-02T15:00:00Z</time></trkpt>
    </trkseg></trk></gpx>`);
    expect(points.map((p) => p.lat)).toEqual([42.0, 42.1]);
    expect(points[0]!.altFt).toBeCloseTo(1000, 0);
  });

  test("KML's gx:Track, as ForeFlight writes its track log", () => {
    const points =
      readTrack(`<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><gx:Track>
      <when>2026-10-02T15:00:00Z</when><when>2026-10-02T15:00:04Z</when>
      <gx:coord>-88.0 42.0 300</gx:coord><gx:coord>-88.0 42.01 310</gx:coord>
    </gx:Track></Placemark></Document></kml>`);
    expect(points).toHaveLength(2);
    expect(points[1]!.lat).toBe(42.01);
  });

  test("a file it cannot use says why", () => {
    expect(() => readTrack("not xml at all")).toThrow(TrackError);
    expect(() => readTrack(`<gpx><trk><trkseg><trkpt lat="42" lon="-88"/><trkpt lat="42.1" lon="-88"/></trkseg></trk></gpx>`)).toThrow(
      /no times/,
    );
    expect(thin(flown(), 100)).toHaveLength(100);
  });
});

// The grading is the engine's, each tolerance and boundary tested there on
// this same flight (engine/facade/tests/figures/drill_cases.rs, the debrief):
// here, that the flight's checkpoints, the track and the pattern altitudes
// reach "debrief" and that its answer is read back into the page's shape.
