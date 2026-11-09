import { keptStore } from "../../lib/storage";
import type { KeptKind } from "../../lib/kept/keptAge";

/**
 * What Keep for the Air last held for a route beside its charts: which of
 * the route's answers are on this device, which could not be had, and how
 * many bytes they came to -- Ready to fly's "kept" row and the keep's toast.
 * The answers themselves are in the service worker's caches and, for the
 * NOTAMs, this browser's storage; this is their list. It names the
 * pilot's route, so signing out forgets it (useLogout); the public
 * aviation data it lists stays.
 */
export interface KeptRecord {
  /** The route as keptRoute writes it: its fields and the alternate. */
  route: string;
  at: number;
  onBoard: KeptKind[];
  missing: KeptKind[];
  bytes: number;
}

const KEPT_RECORD_KEY = "wingtip.kept-air";
export const keptRecordStore = () => keptStore<KeptRecord | null>(KEPT_RECORD_KEY, null);

/** A route's key: its fields in order, then the alternate. */
export function keptRoute(fields: string[], alternate: string | null): string {
  return `${fields.join("-")}|${alternate ?? ""}`;
}

/** The record for `route`, if it is the route last kept. */
export function keptRecord(route: string): KeptRecord | null {
  const record = keptRecordStore().getState().value;
  return record?.route === route ? record : null;
}

/** For signing out: the route kept is the pilot's own. */
export function forgetKeptRecord() {
  keptRecordStore().setState({ value: null });
}

/** Ready to fly's `kept` input: what is on board and what is not, with its
 *  size. Before any keep of this route, nothing is on board and nothing is
 *  named missing: the engine asks for the route's weather, NOTAMs and
 *  plates in general words. */
export function readyKept(record: KeptRecord | null): { on_board: KeptKind[]; missing: KeptKind[]; size_mb: number | null } {
  if (!record) return { on_board: [], missing: [], size_mb: null };
  return { on_board: record.onBoard, missing: record.missing, size_mb: record.bytes / 1e6 };
}
