import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "../../../lib/api/client";
import type { NearestAirport } from "../../../lib/api/types";
import { placeOf, useAirportIndex } from "../../../lib/airportIndex";
import { nearestOnDevice } from "../../../lib/fieldsOnDevice";
import { noConnection } from "../../../lib/problems";
import { NO_FILTERS, filterFields, readQuery, vfrAtTime, type SearchFilters } from "../lib/searchFilters";

/** Where a search sent looks round: a field named, own ship, or the
 *  place the pilot's Nearest is from. */
export interface SearchNear {
  label: string;
  lat: number;
  lon: number;
}

/**
 * A search sent and what narrows it (Apple Maps' results list, the owner's
 * screenshots, 2026-11-10): one store, so the results' chips, the Filters
 * page and the map's marks of the results are one state. `draft` is the
 * Filters page's own until Apply; Cancel lets it go.
 */
interface SearchResultsState {
  sent: { query: string; near: SearchNear } | null;
  filters: SearchFilters;
  draft: SearchFilters | null;
  /** A result's card opened, from its row or its mark on the map. */
  open: ((ident: string) => void) | null;
  send: (query: string, near: SearchNear, filters: Partial<SearchFilters>, open: (ident: string) => void) => void;
  clear: () => void;
  setFilters: (patch: Partial<SearchFilters>) => void;
  openFilters: () => void;
  setDraft: (patch: Partial<SearchFilters>) => void;
  applyDraft: () => void;
  cancelDraft: () => void;
}

export const useSearchResults = create<SearchResultsState>((set) => ({
  sent: null,
  filters: NO_FILTERS,
  draft: null,
  open: null,
  send: (query, near, filters, open) => set({ sent: { query, near }, filters: { ...NO_FILTERS, ...filters }, draft: null, open }),
  clear: () => set({ sent: null, filters: NO_FILTERS, draft: null, open: null }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  openFilters: () => set((s) => ({ draft: s.filters })),
  setDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : {})),
  applyDraft: () => set((s) => (s.draft ? { filters: s.draft, draft: null } : {})),
  cancelDraft: () => set({ draft: null }),
}));

/** Where a search sent looks round: the field it names ("near KMSN", read
 *  from the airport index the browser keeps), else own ship or Nearest's
 *  place (`here`), else the route's departure; none where nothing says. */
export function nearOf(
  text: string,
  index: Parameters<typeof placeOf>[0] | null,
  here: SearchNear | null,
  dep: string | null | undefined,
): SearchNear | null {
  const named = readQuery(text).near;
  const field = named && index ? placeOf(index, named) : null;
  if (field && named) return { label: named, ...field };
  if (here) return here;
  const start = dep && index ? placeOf(index, dep) : null;
  return start && dep ? { label: dep, ...start } : null;
}

/** The most fields the planner's Nearest gives in one answer. */
const MOST = 25;

/** The fields a search sent found and its filters keep, nearest first --
 *  the list and the map's marks read the same answer (react-query's cache).
 *  With "VFR at…" on, the planner is asked for each field's forecast then
 *  too (`at`, the top of that hour). Where the planner cannot be had --
 *  no connection, or it failed -- the fields from the airport index the
 *  browser keeps, ranked by the engine (lib/fieldsOnDevice), said so
 *  (`onDevice`); `offline`, none to be had for want of a connection. */
export function useSearchResultRows(): {
  rows: NearestAirport[];
  all: number;
  loading: boolean;
  failed: boolean;
  onDevice: boolean;
  offline: boolean;
} {
  const sent = useSearchResults((s) => s.sent);
  const filters = useSearchResults((s) => s.filters);
  const round = (n: number) => Math.round(n * 20) / 20;
  const lat = round(sent?.near.lat ?? 0),
    lon = round(sent?.near.lon ?? 0);
  const forecastAt = vfrAtTime(filters.vfrInHours) ?? undefined;
  const asked = useQuery({
    queryKey: ["nearest", lat, lon, MOST, forecastAt ?? null],
    queryFn: () => api.nearestAirports(lat, lon, MOST, forecastAt),
    enabled: !!sent,
    staleTime: 10 * 60_000,
    meta: { silent: true },
  });
  const index = useAirportIndex(!!sent, !!sent);
  const unanswered = !asked.data && (asked.isError || noConnection(asked));
  const onDevice = unanswered && !!index && !!sent;
  const device = useMemo(() => (onDevice && index && sent ? nearestOnDevice(index, sent.near, MOST) : null), [onDevice, index, sent]);
  const data = asked.data ?? device;
  const rows = useMemo(() => (data ? filterFields(data, filters) : []), [data, filters]);
  return {
    rows,
    all: data?.length ?? 0,
    loading: !!sent && asked.isPending && !unanswered,
    failed: unanswered && !device,
    onDevice: !asked.data && !!device,
    offline: noConnection(asked),
  };
}
