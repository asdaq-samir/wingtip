/**
 * The flight watch on the gateway (FlightWatch): the gateway checks a
 * saved flight's weather and NOTAMs again until it leaves, and says what
 * changed, each line with the reports it rests on. The shapes are written
 * by hand, mirroring the gateway's FlightWatchController: `npm run types`
 * has no schema for it yet, and they move to ./types once it does.
 */
import { csrfHeaders, failIfNotOk } from "./client";

/** A report a line rests on, as it was sent: shown raw, never
 *  reformatted (SourceChips). */
export interface Source {
  id: string;
  label: string;
  text: string;
}

/** One line of what changed, with the sources it rests on by id. */
interface ChangeLine {
  text: string;
  sources: string[];
}

/** A watch on a saved flight. */
export interface FlightWatch {
  flightId: number;
  /** ISO. */
  departAt: string;
  checkedAt: string;
  changedAt: string | null;
  changes: ChangeLine[];
  sources: Source[];
}

export const flightWatch = {
  /** Started, or its departure moved: the same POST either way. */
  start: async (flightId: number, departAt: string): Promise<FlightWatch> => {
    const res = await fetch(`/api/flights/${flightId}/watch`, {
      method: "POST",
      body: JSON.stringify({ departAt }),
      headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
    });
    await failIfNotOk(res);
    return res.json() as Promise<FlightWatch>;
  },
  /** The watch as it stands, or null where there is none (a 404). */
  get: async (flightId: number, signal?: AbortSignal): Promise<FlightWatch | null> => {
    const res = await fetch(`/api/flights/${flightId}/watch`, { signal });
    if (res.status === 404) return null;
    await failIfNotOk(res);
    return res.json() as Promise<FlightWatch>;
  },
  stop: async (flightId: number): Promise<void> => {
    const res = await fetch(`/api/flights/${flightId}/watch`, { method: "DELETE", headers: csrfHeaders("DELETE") });
    await failIfNotOk(res);
  },
};
