import { useQuery } from "@tanstack/react-query";
import type { AcsTable } from "./checkride";

/** The FAA's own words for each ACS code (lib/acs.json, 150 KB), loaded
 *  with the page that wants them rather than with the app: the Checkride
 *  page's, and the mock oral's. One query, so the two share the one load
 *  and a page left before it lands sets nothing. */
export function useAcsTable(): AcsTable | null {
  const { data } = useQuery({
    queryKey: ["acsTable"],
    queryFn: async () => (await import("./acs.json")).default as AcsTable,
    staleTime: Infinity,
    meta: { silent: true },
  });
  return data ?? null;
}
