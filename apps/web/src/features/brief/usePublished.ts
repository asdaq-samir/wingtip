import { useEffect, useEffectEvent } from "react";

/**
 * Publishes a value to a store from the one instance that does
 * (`publish`), keyed on what it says rather than the object made each
 * render, and clears it when that instance goes away.
 */
export function usePublished<T>(value: T | null, key: string, set: (value: T | null) => void, publish: boolean) {
  const publishValue = useEffectEvent(() => {
    if (publish) set(value);
  });
  useEffect(() => publishValue(), [key, publish]);
  useEffect(
    () => () => {
      if (publish) set(null);
    },
    [set, publish],
  );
}
