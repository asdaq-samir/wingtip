import type { ReplayReport } from "../../lib/engine/contract";
import { readTrack, TrackError } from "../../lib/track";
import type { AltitudeKind } from "../replay";

/** A file read for the Studio: its reports, and what its altitude is. */
export interface ImportedTrack {
  reports: ReplayReport[];
  altitude: AltitudeKind;
}

/** A CSV's columns by the names exporters give them, read whatever their
 *  case or spaces: Flightradar24's "Timestamp, UTC, Callsign, Position,
 *  Altitude, Speed, Direction" (Position "lat,lon" in one), or columns of
 *  their own. Altitude in feet, speed in knots, as both give them. */
const COLUMNS = {
  time: ["timestamp", "time", "utc", "t"],
  lat: ["lat", "latitude"],
  lon: ["lon", "lng", "long", "longitude"],
  position: ["position"],
  alt: ["altft", "altitude", "alt", "altitudeft"],
  gs: ["gskt", "speed", "groundspeed", "gs"],
  track: ["trackdeg", "direction", "track", "heading", "course"],
} as const;

/** A CSV's rows, each a list of fields: commas, quoted fields with their
 *  doubled quotes (RFC 4180), and CR LF or LF lines. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/** A time as a CSV gives it: seconds since 1970 (Flightradar24's
 *  Timestamp), or an ISO time, UTC where it names no zone. */
function seconds(text: string): number | null {
  const s = text.trim();
  if (/^\d{9,11}(\.\d+)?$/.test(s)) return Number(s);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

const num = (text: string | undefined) => {
  const n = text === undefined || text.trim() === "" ? NaN : Number(text);
  return Number.isFinite(n) ? n : null;
};

/** A CSV track's reports; a TrackError, in words for the pilot, where it
 *  has no time and position columns or no rows to use. */
export function readCsvTrack(text: string): ReplayReport[] {
  const [head, ...rows] = csvRows(text);
  if (!head) throw new TrackError("This file is empty.");
  const names = head.map(key);
  const col = (which: keyof typeof COLUMNS) => names.findIndex((n) => (COLUMNS[which] as readonly string[]).includes(n));
  const [time, lat, lon, position, alt, gs, track] = (["time", "lat", "lon", "position", "alt", "gs", "track"] as const).map(col);
  if (time! < 0 || ((lat! < 0 || lon! < 0) && position! < 0))
    throw new TrackError("This CSV has no time and position columns: Timestamp and Position, or time, lat and lon.");
  const reports: ReplayReport[] = [];
  for (const row of rows) {
    const t = seconds(row[time!] ?? "");
    const [la, lo] = position! >= 0 ? (row[position!] ?? "").split(",").map((v) => num(v)) : [num(row[lat!]), num(row[lon!])];
    if (t === null || la == null || lo == null) continue;
    reports.push({
      t,
      lat: la,
      lon: lo,
      alt_ft: alt! >= 0 ? num(row[alt!]) : null,
      gs_kt: gs! >= 0 ? num(row[gs!]) : null,
      track_deg: track! >= 0 ? num(row[track!]) : null,
    });
  }
  if (reports.length < 2) throw new TrackError("There is no track in this file.");
  return reports;
}

/** A track file the pilot picked: KML or GPX (the engine's reader, lib/track:
 *  GPS height, above sea level) or CSV (the altitude as the exporter
 *  gave it). */
export async function importTrackFile(file: File): Promise<ImportedTrack> {
  const text = await file.text();
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return { reports: readCsvTrack(text), altitude: "reported" };
  const points = readTrack(text);
  return { reports: points.map((p) => ({ t: p.t / 1000, lat: p.lat, lon: p.lon, alt_ft: p.altFt })), altitude: "gps" };
}
