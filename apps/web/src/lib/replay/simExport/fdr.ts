import { altitudeWords, ESTIMATED_WORDS, type SimMeta, type SimSegment } from "./flight";

/*
 * X-Plane's flight data recorder file (.fdr, version 4), which X-Plane 12
 * replays: File, Load Saved Flight, Open Saved Flight Not Listed. The
 * format is Laminar Research's: "A" then the version on the first two
 * lines, then header records (x-plane.com/kb/fdr-files-x-plane-11: COMM,
 * ACFT, TAIL, DATE as MM/DD/YYYY, PRES in inches of mercury), then one row
 * a frame. Version 4's rows (X-Plane 12's "FDR Example Version 4.fdr", as
 * github.com/tvproductions/xplane-fdau documents it from X-Plane 12.4.3,
 * and as 42fdr writes them, github.com/MadReasonable/42fdr): UTC time
 * HH:MM:SS.ss -- hundredths, as more trips X-Plane's "Out of range
 * FDR-file time!" -- longitude, latitude, altitude ft MSL, magnetic
 * heading, pitch (up positive), roll (right positive), then one value for
 * each DREF line, in order, each a dataref from Laminar's list
 * (developer.x-plane.com/datarefs) and its scale.
 *
 * A file is one segment: X-Plane draws a straight line between any two
 * rows, so a gap in the reports is never one file's.
 */

/** The datarefs the rows carry after the roll, with their names in the
 *  column comment: all switches 0 or 1 but the flap handle (0 to 1). */
const DREFS = [
  ["sim/cockpit2/gauges/indicators/ground_speed_kt", "GndSpd"],
  ["sim/cockpit2/controls/gear_handle_down", "Gear"],
  ["sim/cockpit2/controls/flap_handle_request_ratio", "Flaps"],
  ["sim/cockpit2/switches/navigation_lights_on", "Nav"],
  ["sim/cockpit2/switches/beacon_on", "Beacon"],
  ["sim/cockpit2/switches/strobe_lights_on", "Strobe"],
  ["sim/cockpit2/switches/landing_lights_on", "Landing"],
  ["sim/cockpit2/switches/taxi_light_on", "Taxi"],
] as const;

/** X-Plane needs an airplane to fly the file (42fdr's README: "X-Plane
 *  requires the FDR file to specify an aircraft model"); one of the two
 *  every X-Plane 12 carries, by whether the type is a jet, for the
 *  creator to change on the ACFT line to their own. */
const JET = "Aircraft/Laminar Research/Boeing 737-800/b738.acf";
const PROPELLER = "Aircraft/Laminar Research/Cessna 172 SP/Cessna_172SP.acf";

/** ICAO type designators (ICAO Doc 8643) the guess takes for jets:
 *  Airbus and Boeing airliners, regional and business jets. A guess for a
 *  picture, not a figure. */
const JET_TYPE = /^(A2\dN|A3\d[\dN]|B7\d[\dMX]|B3\dM|BCS\d|CRJ\d|E\d{3}|E\d{2}\d?|CL\d\d|GLF\d|GL\d\w|C5\d\d|C6\d\d|C7\d\d|LJ\d\d|FA\d\w)/;

function aircraftPath(meta: SimMeta): string {
  return meta.icaoType && JET_TYPE.test(meta.icaoType) ? JET : PROPELLER;
}

/** MM/DD/YYYY, UTC: the only date X-Plane's reader takes (Laminar's kb). */
function mdy(t: number): string {
  const d = new Date(t * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getUTCMonth() + 1)}/${two(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

/** HH:MM:SS.ss, UTC. */
function clock(t: number): string {
  const day = ((t % 86400) + 86400) % 86400;
  const h = Math.floor(day / 3600),
    m = Math.floor((day % 3600) / 60),
    s = day % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

const comments = (lines: string[]) => lines.map((l) => `COMM, ${l.replace(/[\r\n]+/g, " ")}`);

/** One segment as an X-Plane 12 FDR file. */
export function writeFdr(segment: SimSegment, meta: SimMeta): string {
  const rows = segment.rows;
  const first = rows[0];
  if (!first) return "";
  const header = [
    "A",
    "4",
    "",
    ...comments([
      `${meta.title}: exported from Wingtip Maps' Studio.`,
      ...(meta.model ? [`Airplane: ${meta.model}${meta.icaoType ? ` (${meta.icaoType})` : ""}.`] : []),
      ...(meta.credit ? [`Reports: ${meta.credit}.`] : []),
      `Ten rows a second along a smooth path through the reports, ${clock(first.t)} to ${clock(rows.at(-1)!.t)} UTC.`,
      altitudeWords(segment),
      "Heading is magnetic (World Magnetic Model).",
      ESTIMATED_WORDS,
      "Change the ACFT line below to the X-Plane airplane you want to fly it.",
    ]),
    "",
    `ACFT, ${aircraftPath(meta)}`,
    `TAIL, ${(meta.tail ?? "N/A").replace(/,/g, "")}`,
    `DATE, ${mdy(first.t)}`,
    // X-Plane's sea-level pressure, inHg: the airplane's own altimeter
    // setting, so the altimeter in the replay reads as the crew's did.
    ...(segment.setting_hpa !== null ? [`PRES, ${(segment.setting_hpa / 33.86389).toFixed(2)}`] : []),
    "",
    ...DREFS.map(([path]) => `DREF, ${path}\t1.0`),
    "",
    ...comments([`time, longitude, latitude, altitude ft MSL, heading (mag), pitch, roll, ${DREFS.map(([, name]) => name).join(", ")}`]),
  ];
  const bit = (b: boolean) => (b ? "1" : "0");
  const data = rows.map((r) =>
    [
      clock(r.t),
      r.lon.toFixed(7),
      r.lat.toFixed(7),
      r.alt_ft.toFixed(1),
      r.heading_mag_deg.toFixed(2),
      r.pitch_deg.toFixed(2),
      r.bank_deg.toFixed(2),
      r.gs_kt.toFixed(1),
      bit(r.gear_down),
      r.flaps.toFixed(2),
      bit(r.lights.nav),
      bit(r.lights.beacon),
      bit(r.lights.strobe),
      bit(r.lights.landing),
      bit(r.lights.taxi),
    ].join(", "),
  );
  return [...header, ...data, ""].join("\n");
}
