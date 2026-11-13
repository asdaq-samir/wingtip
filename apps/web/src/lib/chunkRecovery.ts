import { create } from "zustand";

/**
 * A lazy chunk that would not load, most often because a deploy after this
 * page's own replaced it (the owner's phone, a page kept open from an older
 * build, 2026-11-10), recovered by itself where it can: the server (or the
 * service worker) asked whether it has a newer build -- index.html fetched
 * past every cache, and the worker's update() -- and if it has, the page
 * loaded again once, its route kept (freshLoad's keepAddressThroughReload).
 * A guard in sessionStorage stops a loop: a second failure inside a minute
 * falls to the route's PageError, which says which it is (`useChunkFailure`):
 * a newer version ready, no connection, or a part that did not load.
 */
export type ChunkFailure = "newer" | "offline" | "failed";

export const useChunkFailure = create<{ failure: ChunkFailure | null }>(() => ({ failure: null }));

const GUARD = "wingtip.chunkReload";
const AGAIN_AFTER_MS = 60_000;

export interface RecoverWith {
  /** The served index.html, past every cache; null where there is no answer. */
  fetchIndex: () => Promise<string | null>;
  /** This page's entry script's address, which a newer index no longer names. */
  entry: string | null;
  /** Asks the service worker for a newer build. */
  update: () => Promise<void>;
  reload: () => void;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  online: boolean;
  now?: number;
}

/** Whether a newer build is served: an index that no longer names this
 *  page's entry script. */
export function newerBuild(index: string, entry: string | null): boolean {
  if (!entry) return false;
  const path = entry.replace(/^[a-z]+:\/\/[^/]+/i, "");
  return !index.includes(path);
}

/**
 * What a chunk's failure comes to: a reload (true, the caller's event's
 * default prevented), or none, and the failure said by PageError.
 */
export async function recoverChunk(w: RecoverWith): Promise<ChunkFailure | "reloaded"> {
  const now = w.now ?? Date.now();
  if (!w.online) return "offline";
  const index = await w.fetchIndex();
  if (index === null) return "offline";
  if (!newerBuild(index, w.entry)) return "failed";
  let last = 0;
  try {
    last = Number(w.storage?.getItem(GUARD)) || 0;
  } catch {
    /* storage refused: reload once */
  }
  if (now - last < AGAIN_AFTER_MS) return "newer";
  try {
    w.storage?.setItem(GUARD, String(now));
  } catch {
    /* as above */
  }
  await w.update().catch(() => {});
  w.reload();
  return "reloaded";
}
