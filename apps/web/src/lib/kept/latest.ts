import { useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

/** The newest answer the query cache holds under `prefix` (a route's nav
 *  log, say: ["navlog", dep, dest]), when it came and whether asking again
 *  since failed; null where none has come. */
export function latestAnswer<T = unknown>(client: QueryClient, prefix: QueryKey): { data: T; atMs: number; failed: boolean } | null {
  let best: { data: T; atMs: number; failed: boolean } | null = null;
  for (const q of client.getQueryCache().findAll({ queryKey: prefix })) {
    const at = q.state.dataUpdatedAt;
    if (q.state.data !== undefined && at > (best?.atMs ?? 0))
      best = { data: q.state.data as T, atMs: at, failed: q.state.errorUpdatedAt > at };
  }
  return best;
}

/** The same, kept up as the cache changes: for a kept answer's age where
 *  the page holding it does not pass its query down (KeptAge). */
export function useLatestAnswer(prefix: QueryKey): { atMs: number; failed: boolean } | null {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const key = JSON.stringify(prefix);
  const seen = useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => {
      const found = latestAnswer(client, JSON.parse(key) as QueryKey);
      return found ? `${found.atMs}|${found.failed}` : "";
    },
  );
  if (!seen) return null;
  const [at, failed] = seen.split("|");
  return { atMs: Number(at), failed: failed === "true" };
}
