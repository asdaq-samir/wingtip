import { useEffect, useState } from "react";

/** `value` once it has stood still for `delayMs`: what is typed asked
 *  about a word at a time, not a letter (the airport search, Nearest's
 *  places). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
