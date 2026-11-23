import { createStore, del, get, set } from "idb-keyval";
import type { TemplateId } from "./templates";

/**
 * The scratchpad's pages, kept on this device in IndexedDB (idb-keyval)
 * and never sent anywhere: what a pilot copies is theirs
 * (docs/privacy-inventory.md). Each page is tied to the flight it was
 * written for -- the route's departure and destination as the address
 * has them -- so a flight's pages are listed first while it is open.
 */

/** One stroke of ink: its points as fractions of the page's width from
 *  its left and top (so the page can be drawn at any width), with the
 *  pen's pressure, and whether a pen drew it (a finger's has none). */
export interface Stroke {
  points: [x: number, y: number, pressure: number][];
  pen: boolean;
}

/** The flight a page was written for: the route's ends, either missing. */
export interface FlightLink {
  dep: string | null;
  dest: string | null;
}

export interface Pad {
  id: string;
  template: TemplateId;
  flight: FlightLink | null;
  /** ISO 8601. */
  created: string;
  updated: string;
  fields: Record<string, string>;
  strokes: Stroke[];
}

export interface PadStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

let device: PadStore | null = null;

/** The device's own store, opened at its first use. */
export function padStore(): PadStore {
  if (device) return device;
  const store = createStore("wingtip-scratchpads", "pads");
  device = { get: (k) => get(k, store), set: (k, v) => set(k, v, store), del: (k) => del(k, store) };
  return device;
}

const LIST = "list";
const padKey = (id: string) => `pad/${id}`;

/** Every page, newest first. */
export async function allPads(s: PadStore): Promise<Pad[]> {
  const ids = (await s.get<string[]>(LIST)) ?? [];
  const pads = await Promise.all(ids.map((id) => s.get<Pad>(padKey(id))));
  return pads.filter((p): p is Pad => !!p).sort((a, b) => b.updated.localeCompare(a.updated));
}

/** A page kept, new or changed. */
export async function savePad(s: PadStore, pad: Pad): Promise<void> {
  await s.set(padKey(pad.id), pad);
  const ids = (await s.get<string[]>(LIST)) ?? [];
  if (!ids.includes(pad.id)) await s.set(LIST, [...ids, pad.id]);
}

export async function removePad(s: PadStore, id: string): Promise<void> {
  const ids = (await s.get<string[]>(LIST)) ?? [];
  await s.set(
    LIST,
    ids.filter((i) => i !== id),
  );
  await s.del(padKey(id));
}

/** A new page of a template for a flight, written now. */
export function newPad(template: TemplateId, flight: FlightLink | null, now = new Date(), id: string = crypto.randomUUID()): Pad {
  const at = now.toISOString();
  return { id, template, flight, created: at, updated: at, fields: {}, strokes: [] };
}

/** The same flight: both ends alike, a missing end matching only a missing one. */
export function sameFlight(a: FlightLink | null, b: FlightLink | null): boolean {
  return !!a && !!b && (a.dep ?? null) === (b.dep ?? null) && (a.dest ?? null) === (b.dest ?? null) && !!(a.dep || a.dest);
}

/** The flight as a page's row names it: "C81 → KOSH", or null. */
export function flightWords(f: FlightLink | null): string | null {
  if (!f || !(f.dep || f.dest)) return null;
  return [f.dep, f.dest].filter(Boolean).join(" → ");
}
