import { useSyncExternalStore } from "react";

/** Whether the browser has a network, said again as it comes and goes:
 *  the Status page's line, and where a kept answer says its age
 *  (lib/kept). True where the browser cannot tell (prerendering). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (change) => {
      window.addEventListener("online", change);
      window.addEventListener("offline", change);
      return () => {
        window.removeEventListener("online", change);
        window.removeEventListener("offline", change);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
