import { useSyncExternalStore } from "react";

type Popups = typeof import("./popups");

/**
 * The anchored popups -- Base UI's menus, popovers and tooltips, and the
 * positioning and focus code they share, about 120 KB -- on a chunk of
 * their own (components/popups), fetched while the page draws (main.tsx)
 * and not part of the first load: Base UI's took the first load from
 * 1.09 to 1.17 MB, over its 1.10 MB budget (scripts/first-load.mjs,
 * 2026-11-09), where Radix's had fitted. The first render waits for the
 * engine's WebAssembly and the fonts, so the chunk is nearly always in by
 * then; until it is, a control that opens one draws as itself, and a tap
 * on it opens it once the chunk is in.
 */
let popups: Popups | null = null;
let loading: Promise<Popups> | null = null;
const listeners = new Set<() => void>();

export function loadPopups(): Promise<Popups> {
  loading ??= import("./popups").then((module) => {
    popups = module;
    for (const heard of listeners) heard();
    return module;
  });
  return loading;
}

const subscribe = (heard: () => void) => {
  listeners.add(heard);
  return () => void listeners.delete(heard);
};

/** The popups' module once it is in, else null (and it is asked for). */
export function usePopups(): Popups | null {
  const module = useSyncExternalStore(
    subscribe,
    () => popups,
    () => null,
  );
  if (!module) void loadPopups().catch(() => {});
  return module;
}
