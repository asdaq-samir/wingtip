import type { QueryClient } from "@tanstack/react-query";
import type { LogbookEntry, LogbookEntryRequest } from "../../../lib/api/types";
import { said } from "../../../lib/endorsements";
import { localDay } from "../../../lib/format";

/** A new flight's columns, flown today in `aircraft` (the airplane picked
 *  for planning). */
export function blankEntry(aircraft = ""): LogbookEntryRequest {
  return {
    flownOn: localDay(),
    aircraft,
    aircraftType: "",
    route: "",
    totalHours: 0,
    nightHours: 0,
    crossCountryHours: 0,
    dayLandings: 1,
    nightLandings: 0,
    remarks: "",
    dualHours: 0,
    soloHours: 0,
    instrumentHours: 0,
    toweredLandings: 0,
    distanceNm: 0,
    longestLegNm: 0,
    approaches: 0,
    holding: false,
    tracking: false,
    // Typed in, not drawn from a track (features/logbook-auto).
    airHours: 0,
    touchAndGoes: 0,
    fromTrack: false,
    flightId: null,
  };
}

/** A logged flight as its form and the server take it back: every column
 *  as it was, its track's and saved flight's links kept, so an Undo puts
 *  back the same flight. */
export function requestOf(entry: LogbookEntry): LogbookEntryRequest {
  const { id: _id, ...columns } = entry;
  return {
    ...columns,
    aircraft: entry.aircraft ?? "",
    aircraftType: entry.aircraftType ?? "",
    route: entry.route ?? "",
    remarks: entry.remarks ?? "",
  };
}

/** What the Undo row says went: "3 Nov 2026 KMSN-KDLH Deleted". */
export function deletedWords(entry: Pick<LogbookEntry, "flownOn" | "route">): string {
  return `${said(entry.flownOn)}${entry.route ? ` ${entry.route}` : ""} Deleted`;
}

/** Everything a logged flight counts toward, fetched again after one
 *  changes: the list, currency, the checkride's experience, what is due. */
export function refreshLogbook(queryClient: QueryClient) {
  for (const key of ["logbook", "currency", "training", "paperwork"]) void queryClient.invalidateQueries({ queryKey: [key] });
}
