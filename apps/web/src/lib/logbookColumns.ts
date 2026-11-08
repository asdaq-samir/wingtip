import { callEngine } from "./engine/engine";

/**
 * A logbook file whose columns are not ForeFlight's own, made into one the
 * engine reads (lib/logbookCsv, logbook_csv_read): the pilot says which of
 * the file's columns is which -- guessed first from the names MyFlightbook,
 * LogTen and plain spreadsheets give them -- and the file is written again
 * under ForeFlight's field names (ForeFlight Logbook Guide v14.0's
 * template), those columns only. Nothing is read or reckoned here: what
 * each column means for currency stays the engine's.
 */

/** One field the engine reads: ForeFlight's name for it, its words on the
 *  screen, and the names other logbooks give it, most likely first,
 *  compared as `keyOf` makes them. */
export interface ColumnTarget {
  field: string;
  label: string;
  aliases: string[];
  /** Without it the engine finds no flights (a date, the airplane and the
   *  total time are what it looks for in a row of field names). */
  required?: boolean;
}

export const COLUMN_TARGETS: ColumnTarget[] = [
  { field: "Date", label: "Date", aliases: ["date", "flightdate", "dateflown"], required: true },
  // MyFlightbook's "Aircraft ID" is its own number for the airplane, not
  // the tail: its "Tail Number" is looked for first.
  { field: "AircraftID", label: "Airplane (tail number)", aliases: ["tailnumber", "displaytail", "aircraftid", "registration", "tail", "aircraft", "ident"], required: true },
  { field: "TypeCode", label: "Type", aliases: ["typecode", "icaomodel", "model", "aircrafttype", "type", "makemodel"] },
  { field: "From", label: "From", aliases: ["from", "departure", "dep", "origin"] },
  { field: "Route", label: "Route", aliases: ["route", "via"] },
  { field: "To", label: "To", aliases: ["to", "arrival", "arr", "destination", "dest"] },
  { field: "TotalTime", label: "Total time", aliases: ["totaltime", "totalflighttime", "total", "totalduration", "duration"], required: true },
  { field: "Night", label: "Night", aliases: ["night", "nighttime"] },
  { field: "CrossCountry", label: "Cross-country", aliases: ["crosscountry", "xcountry", "xc"] },
  { field: "AllLandings", label: "Landings, all", aliases: ["alllandings", "landings", "totallandings"] },
  { field: "DayLandingsFullStop", label: "Day full-stop landings", aliases: ["daylandingsfullstop", "fsdaylandings", "daylandings"] },
  { field: "NightLandingsFullStop", label: "Night full-stop landings", aliases: ["nightlandingsfullstop", "fsnightlandings", "nightlandings"] },
  { field: "DualReceived", label: "Dual received", aliases: ["dualreceived", "dual"] },
  { field: "Solo", label: "Solo", aliases: ["solo"] },
  { field: "ActualInstrument", label: "Actual instrument", aliases: ["actualinstrument", "imc", "actual"] },
  { field: "SimulatedInstrument", label: "Simulated instrument", aliases: ["simulatedinstrument", "siminstrument", "hood"] },
  { field: "Approaches", label: "Approaches", aliases: ["approaches", "instrumentapproaches"] },
  { field: "Holds", label: "Holds", aliases: ["holds", "hold", "holding"] },
  { field: "PilotComments", label: "Remarks", aliases: ["pilotcomments", "comments", "remarks", "notes"] },
];

/** A column's name as compared, as the engine compares ForeFlight's:
 *  "Total Time" and "TotalTime" are one. */
export function keyOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const BOM = String.fromCharCode(0xfeff);

/** The file's rows, read by the engine's CSV reader (csv_rows). */
export function csvRows(text: string): string[][] {
  // A byte order mark (a spreadsheet's UTF-8) is not the first name.
  return callEngine("csv_rows", { text: text.startsWith(BOM) ? text.slice(1) : text });
}

/** The row of field names: the first that names a date and a total time,
 *  else the first with anything in it; -1 for an empty file. */
export function headerRowOf(rows: string[][]): number {
  const names = (field: string) => COLUMN_TARGETS.find(t => t.field === field)!.aliases;
  const has = (row: string[], field: string) => row.some(c => names(field).includes(keyOf(c)));
  const named = rows.findIndex(r => has(r, "Date") && has(r, "TotalTime"));
  return named >= 0 ? named : rows.findIndex(r => r.some(c => c.trim()));
}

/** Which of the file's columns each field is read from, by index; null for
 *  none. */
export type Columns = Record<string, number | null>;

/** The columns guessed from their names: each field's first alias found,
 *  no column given to two fields. */
export function guessColumns(header: string[]): Columns {
  const keys = header.map(keyOf);
  const taken = new Set<number>();
  const out: Columns = {};
  for (const t of COLUMN_TARGETS) {
    const at = t.aliases.map(a => keys.findIndex((k, i) => k === a && !taken.has(i))).find(i => i >= 0);
    out[t.field] = at ?? null;
    if (at != null) taken.add(at);
  }
  return out;
}

/** The fields the engine needs that no column is given to. */
export function missingColumns(columns: Columns): ColumnTarget[] {
  return COLUMN_TARGETS.filter(t => t.required && columns[t.field] == null);
}

/** One CSV cell as RFC 4180 writes it: quoted where it holds a comma, a
 *  quote or a line break, its quotes doubled. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The file written again under ForeFlight's field names, the columns
 *  given only, the rows after the field names kept in order -- their line
 *  numbers in the engine's answer counted in this file, one row of names
 *  at its top. */
export function remapped(rows: string[][], headerAt: number, columns: Columns): string {
  const used = COLUMN_TARGETS.filter(t => columns[t.field] != null);
  const lines = [used.map(t => t.field)];
  for (const row of rows.slice(headerAt + 1)) lines.push(used.map(t => row[columns[t.field]!] ?? ""));
  return lines.map(l => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
