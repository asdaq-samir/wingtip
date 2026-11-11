import type { components } from "../../../lib/api/gateway-schema";
import type { FlightSummary } from "../../../lib/api/types";
import { routeName } from "../../../lib/identSchema";

/** PATCH /api/flights/{id}'s body: null keeps a field, blank clears it. */
export type FlightEditRequest = components["schemas"]["UpdateFlightRequest"];

/** As the gateway checks them (UpdateFlightRequest.java): a name of at
 *  most 80 characters, notes of at most 2,000. */
export const NAME_MAX = 80;
export const NOTES_MAX = 2000;

/** A saved flight as its row calls it: the pilot's name for it, else its
 *  route, as every flight was called before it could be named. */
export function flightTitle(f: Pick<FlightSummary, "name" | "departureIdent" | "destinationIdent" | "stops">): string {
  return f.name?.trim() || routeName(f.departureIdent, f.destinationIdent, f.stops);
}

/**
 * What a row's edit asks the gateway to change: only the fields that
 * changed, the rest null so they are kept, and a field emptied sent blank
 * so it is cleared. Nothing changed, nothing to send: the row closes with
 * no round trip.
 */
export function flightEdit(f: Pick<FlightSummary, "name" | "notes">, name: string, notes: string): FlightEditRequest | null {
  const nextName = name.trim();
  const nextNotes = notes.trim();
  const nameChanged = nextName !== (f.name ?? "").trim();
  const notesChanged = nextNotes !== (f.notes ?? "").trim();
  if (!nameChanged && !notesChanged) return null;
  return { name: nameChanged ? nextName : null, notes: notesChanged ? nextNotes : null };
}

/** What is wrong with the edit before it is sent, as the gateway would
 *  say it, or null. */
export function flightEditProblem(name: string, notes: string): string | null {
  if (name.trim().length > NAME_MAX) return `The name is at most ${NAME_MAX} characters`;
  if (notes.trim().length > NOTES_MAX) return `The notes are at most ${NOTES_MAX.toLocaleString("en-US")} characters`;
  return null;
}
