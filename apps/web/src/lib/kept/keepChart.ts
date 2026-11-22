import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TerminalChart } from "../api/types";
import { chartPagePicture } from "../diagram";

/**
 * One of the FAA's charts kept on this device as the airport card's Charts
 * tab shows it (AirportDiagramViewer, under the same query key): its pages
 * from the planner (/api/faa-chart, of a booklet the ones naming the field)
 * and each page's picture, both through the service worker, which keeps
 * them in its "faa-plates" cache as they pass (vite.config.ts), so a plate
 * opens in the air with no signal. Keep for the Air keeps a flight's this
 * way (features/keptForAir) and Downloads a state's (features/statePlates).
 */

/** The size of an answer as JSON, about what the worker holds of it. */
export const bytesOf = (data: unknown) => {
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    return 0;
  }
};

/** A chart's pages and their pictures fetched so the worker keeps them;
 *  their bytes. Throws where the planner could not give them. */
export async function keepChart(
  client: QueryClient,
  chart: Pick<TerminalChart, "url">,
  ident: string,
  signal?: AbortSignal,
): Promise<number> {
  const pages = await client.fetchQuery({
    queryKey: ["faaChart", chart.url, ident],
    queryFn: () => api.faaChart(chart.url, ident),
    staleTime: Infinity,
  });
  let bytes = bytesOf(pages);
  for (const page of pages.pages) {
    const res = await fetch(chartPagePicture(page), { signal, priority: "low" });
    if (!res.ok) throw new Error(`${res.status}`);
    bytes += (await res.blob()).size;
  }
  return bytes;
}

/** A chart's key, its cycle and PDF as its address names them
 *  ("/2611/00366IL10R.PDF"): what a kept page's and a kept list's addresses
 *  are matched by when a set is deleted. */
export const chartKey = (url: string) => "/" + url.split("/").slice(-2).join("/");

/** The worker's cache of the FAA's charts' pages and lists (vite.config.ts). */
export const PLATES_CACHE = "faa-plates";
