// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { callEngine } from "../../engine/engine";
import fixture from "../../fixtures/simExport.json";
import { writeFdr } from "./fdr";
import { runAround, simSegmentAround, simSegments, type SimMeta, type SimSource } from "./flight";
import { writeGpx } from "./gpx";
import { writeKml } from "./kml";
import { writeSkyDollyCsv } from "./skyDolly";

// The shared departure and gap (lib/fixtures/simExport.json), which the
// engine's own test reads too (engine/facade/tests/sim.rs).
const { reports, ground, segments: segmentCount, firstRows, secondRows, settingHpa } = fixture.departureThenGap;
const ready = callEngine("replay_track", { points: reports });
const source: SimSource = {
  points: ready.points,
  settings: reports.flatMap((r) => ("qnh_hpa" in r && r.qnh_hpa ? [{ t: r.t, hpa: r.qnh_hpa, alt_ft: r.alt_ft }] : [])),
  ground,
  pressure: true,
};
const meta: SimMeta = {
  title: "N14511 · Nov 10",
  tail: "N14511",
  icaoType: "A21N",
  model: "Airbus S A S A321-271NX",
  credit: "adsb.lol, ODbL 1.0",
};
const segments = simSegments(source, 10);
const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const GX = "http://www.google.com/kml/ext/2.2";
const KML = "http://www.opengis.net/kml/2.2";

describe("the flight made ready for a simulator", () => {
  it("is two segments, never bridged across the gap, ten frames a second", () => {
    expect(segments).toHaveLength(segmentCount);
    expect(segments[0]!.rows).toHaveLength(firstRows);
    expect(segments[1]!.rows).toHaveLength(secondRows);
    expect(segments[0]!.setting_hpa).toBe(settingHpa);
    expect(segments[1]!.msl).toBe(false);
  });

  it("exports the run the replay's moment is in, or the nearest", () => {
    const [a, b] = [segments[0]!.rows[0]!.t, segments[1]!.rows[0]!.t];
    expect(runAround(source.points, a + 30)?.from).toBe(a);
    expect(runAround(source.points, b + 5)?.from).toBe(b);
    // In the gap, nearer the second run.
    expect(runAround(source.points, b - 10)?.from).toBe(b);
    expect(simSegmentAround(source, b + 5, 10)?.rows).toHaveLength(secondRows);
  });
});

describe("X-Plane's FDR", () => {
  const lines = writeFdr(segments[0]!, meta).split("\n");
  const data = lines.filter((l) => /^\d\d:\d\d:\d\d\.\d\d, /.test(l));

  it("starts as Laminar's format does and names the airplane, day and pressure", () => {
    expect(lines.slice(0, 2)).toEqual(["A", "4"]);
    expect(lines).toContain("ACFT, Aircraft/Laminar Research/Boeing 737-800/b738.acf");
    expect(lines).toContain("TAIL, N14511");
    expect(lines).toContain("DATE, 11/10/2026");
    // 1,022.4 hPa in inches of mercury (NIST SP 811: 33.86389 hPa an inch).
    expect(lines).toContain("PRES, 30.19");
    expect(lines.filter((l) => l.startsWith("DREF, "))).toHaveLength(8);
    expect(lines.filter((l) => l.startsWith("COMM, ")).some((l) => l.includes("Estimated"))).toBe(true);
  });

  it("has a row a frame: time, position, altitude, attitude, then a value per DREF", () => {
    expect(data).toHaveLength(firstRows);
    expect(data[0]!.startsWith("01:00:00.00, ")).toBe(true);
    expect(data[1]!.startsWith("01:00:00.10, ")).toBe(true);
    expect(data.every((l) => l.split(", ").length === 7 + 8)).toBe(true);
    // On the ground at the field's 672 ft, gear down, the taxi light on.
    const first = data[0]!.split(", ");
    expect(Number(first[3])).toBe(672);
    expect(first.slice(8)).toEqual(["1", "0.25", "1", "1", "0", "0", "1"]);
  });
});

describe("Sky Dolly's Flight Recorder CSV", () => {
  const rows = writeSkyDollyCsv(segments[0]!)
    .trim()
    .split("\n")
    .map((l) => l.split(","));

  it("has the header Sky Dolly's reader looks for and its 43 columns in every row", () => {
    expect(rows[0]!.slice(0, 4).join(",")).toBe("Milliseconds,Latitude,Longitude,Altitude");
    expect(rows[0]).toHaveLength(43);
    expect(rows.slice(1)).toHaveLength(firstRows);
    expect(rows.every((r) => r.length === 43)).toBe(true);
  });

  it("counts milliseconds from the start and pitches up as SimConnect does, negative", () => {
    const col = (name: string) => rows[0]!.indexOf(name);
    expect(rows[1]![col("Milliseconds")]).toBe("0");
    expect(rows.at(-1)![col("Milliseconds")]).toBe("60000");
    const climbing = rows[500]!;
    expect(Number(climbing[col("Pitch")])).toBeLessThan(0);
    expect(climbing[col("GearHandlePosition")]).toBe("0");
  });

  it("sets the thrust levers as the engine estimates them, back while taxiing", () => {
    const col = rows[0]!.indexOf("ThrottleLeverPosition1");
    expect(rows[1]![col]).toBe(String(segments[0]!.rows[0]!.throttle));
    expect(segments[0]!.rows[0]!.throttle).toBeLessThan(0.5);
  });
});

describe("KML", () => {
  it("for Google Earth: one track a segment, the gap left empty, heights absolute in metres", () => {
    const doc = xml(writeKml(segments, meta, "earth"));
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const multi = doc.getElementsByTagNameNS(GX, "MultiTrack");
    expect(multi).toHaveLength(1);
    expect(multi[0]!.getElementsByTagNameNS(GX, "interpolate")[0]!.textContent).toBe("0");
    const tracks = doc.getElementsByTagNameNS(GX, "Track");
    expect(tracks).toHaveLength(2);
    for (const t of Array.from(tracks)) {
      expect(t.getElementsByTagNameNS(KML, "altitudeMode")[0]!.textContent).toBe("absolute");
      expect(t.getElementsByTagNameNS(KML, "when").length).toBe(t.getElementsByTagNameNS(GX, "coord").length);
    }
    expect(tracks[0]!.getElementsByTagNameNS(KML, "when")[0]!.textContent).toBe("2026-11-10T01:00:00.00Z");
    // 672 ft is 204.8 m.
    expect(tracks[0]!.getElementsByTagNameNS(GX, "coord")[0]!.textContent).toBe("-87.9048000 41.9786000 204.8");
  });

  it("as FlightAware writes it, for FlightControlReplay: one track, no multitrack", () => {
    const doc = xml(writeKml([segments[0]!], meta, "flightaware"));
    expect(doc.getElementsByTagNameNS(GX, "MultiTrack")).toHaveLength(0);
    expect(doc.getElementsByTagNameNS(GX, "Track")).toHaveLength(1);
    expect(doc.getElementsByTagNameNS(KML, "Placemark")[0]!.getElementsByTagNameNS(KML, "name")[0]!.textContent).toBe("N14511");
  });
});

describe("GPX", () => {
  it("is a segment for each run of reports, each point its elevation then its time", () => {
    const doc = xml(writeGpx(segments, meta));
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.getAttribute("version")).toBe("1.1");
    const segs = doc.getElementsByTagName("trkseg");
    expect(segs).toHaveLength(2);
    const pt = segs[0]!.getElementsByTagName("trkpt")[0]!;
    expect(Array.from(pt.children).map((c) => c.tagName)).toEqual(["ele", "time"]);
    expect(pt.getAttribute("lat")).toBe("41.9786000");
    expect(pt.getElementsByTagName("ele")[0]!.textContent).toBe("204.8");
  });
});
