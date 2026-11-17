import { useSyncExternalStore } from "react";

/**
 * A module on a chunk of its own that a part draws without while it is on
 * its way, rather than suspending (fromChunk's `lazy`): the part draws as
 * itself and takes the module's richer self once it is in. `load` asks for
 * it, once; `use` gives it where it is in, else null, and asks for it
 * unless told not to. The popups' menus (popupsChunk) and the rows' swipe
 * (SwipeRow) are each one.
 */
export function lazyModule<M>(fetch: () => Promise<M>) {
  let module: M | null = null;
  let loading: Promise<M> | null = null;
  const listeners = new Set<() => void>();
  const load = (): Promise<M> => {
    loading ??= fetch().then((loaded) => {
      module = loaded;
      for (const heard of listeners) heard();
      return loaded;
    });
    return loading;
  };
  const subscribe = (heard: () => void) => {
    listeners.add(heard);
    return () => void listeners.delete(heard);
  };
  function use(wanted = true): M | null {
    const got = useSyncExternalStore(
      subscribe,
      () => module,
      () => null,
    );
    if (!got && wanted) void load().catch(() => {});
    return got;
  }
  return { load, use };
}
