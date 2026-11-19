import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { useAddressKey } from "../../lib/address";

export interface AlternateWhere {
  /** The destination, its ident. */
  dest: string;
  /** The ETA there, an ISO instant; null before the nav log has one. */
  eta: string | null;
  /** The airplane's cruise speed, the way on to an alternate flown at it;
   *  null with no airplane, and no alternate is timed (no stock speed). */
  tasKt: number | null;
}

/** The alternate filed (the address's `alternate`, per route), and the
 *  planner's check of it and of the destination (wingtip.alternates). */
export function useAlternate({ dest, eta, tasKt }: AlternateWhere) {
  const filed = useAddressKey("alternate")[0] ?? "";
  const query = useQuery({
    queryKey: ["alternate", dest, eta, tasKt, filed],
    queryFn: () => api.alternate(dest, eta!, tasKt!, filed),
    enabled: !!dest && !!eta && tasKt != null,
    staleTime: 5 * 60_000,
    // The check before kept while the same destination and alternate are
    // checked again for another arrival time (another airplane, another
    // altitude): its section emptied and came back (the flicker audit's E).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === dest && previousQuery.queryKey[4] === filed ? previous : undefined,
    // Said in its own section, where it was asked for.
    meta: { silent: true },
  });
  return { filed, ...query };
}
