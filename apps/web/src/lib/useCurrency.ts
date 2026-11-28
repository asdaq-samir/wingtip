import { useQuery } from "@tanstack/react-query";
import type { AirplaneKind } from "./api/types";
import { flyingOf, type Flying } from "./airplaneKind";
import { usePreferences } from "./preferences";
import { pilotQuery } from "./queryClient";
import { aircraftListQuery, currencyQuery } from "./queryClientRecords";

/** The airplane picked in FPL as the airplane to be flown (14 CFR
 *  61.57(a)(1)(ii)): one of the pilot's own whose profile says its
 *  category and class; else null, and the newest flight's is judged.
 *  `kind` is what its profile says of it, any part, for an entry flown in
 *  it to be filled in with.
 *  `settled` is false while the pilot's airplanes are still coming, so
 *  currency is not asked once without the airplane and again with it. */
export function useAirplaneFlown(): { flying: Flying | null; kind: AirplaneKind | null; settled: boolean } {
  const { data: pilot } = useQuery(pilotQuery);
  const flyingId = usePreferences((p) => p.aircraft.aircraftId);
  const own = useQuery({ ...aircraftListQuery, enabled: !!pilot && flyingId != null });
  if (flyingId == null) return { flying: null, kind: null, settled: true };
  const kind = own.data?.find((a) => a.id === flyingId)?.kind ?? null;
  return { flying: flyingOf(kind), kind, settled: !own.isPending };
}

/**
 * The pilot's currency, judged for the airplane picked in FPL: every
 * reader's one way in (the Logbook, the coach, the Brief, the departure
 * window, the copilot). Asked only for a pilot signed in, and where
 * `enabled` says so.
 */
export function useCurrency({ enabled = true, silent = false }: { enabled?: boolean; silent?: boolean } = {}) {
  const { data: pilot } = useQuery(pilotQuery);
  const { flying, settled } = useAirplaneFlown();
  return useQuery({
    ...currencyQuery(flying),
    enabled: enabled && !!pilot && settled,
    ...(silent ? { retry: false, meta: { silent: true } } : {}),
  });
}
