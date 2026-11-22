import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../lib/api/client";
import { engineLoaded } from "../../lib/engine/engine";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { usePreferences } from "../../lib/preferences";
import { airportQuery } from "../../lib/queryClient";
import { speak } from "../../lib/speech";
import { useClock } from "../../lib/useMinuteClock";
import { adviceOf, graticuleOf, hotSpotsOf, markOf } from "./diagramPlace";
import { readDiagram } from "./diagramText";

/** Once a second: the engine ages a fix that stops coming (its
 *  diagram_fix_usable), so the page asks it each second and the airplane
 *  leaves the page in time, never frozen on it. */
const EVERY_MS = 1000;

/**
 * The airport diagram's view model full screen (AdvisedDiagram): own ship
 * on the page where its latitude and longitude labels put it, the hot
 * spots ringed, and the runway proximity advisor's line -- "Approaching
 * runway 9-27", "On runway 27", the hold short line's distance -- said
 * aloud as it changes where the pilot has Speak Alerts on (the Map menu's
 * Alerts). The page's words read from its PDF once a cycle (diagramText);
 * every rule is the engine's (diagramPlace). `note` says why the airplane
 * is not drawn where it is not.
 */
export function useDiagramAdvisor(ident: string, url: string | null | undefined) {
  const pdf = url ? api.faaChartPdfUrl(url) : null;
  const place = useQuery(airportQuery(ident)).data;
  const text = useQuery({
    queryKey: ["diagramText", pdf],
    queryFn: () => readDiagram(pdf!),
    enabled: !!pdf,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });
  const page = text.data ?? null;
  const graticule = useMemo(() => (page && engineLoaded() ? graticuleOf(page) : null), [page]);
  const spots = useMemo(() => (page && graticule ? hotSpotsOf(page, graticule) : []), [page, graticule]);
  const fix = useOwnShip((s) => (s.enabled ? s.fix : null));
  const now = useClock(EVERY_MS, !!fix);
  const mark = page && engineLoaded() ? markOf(fix, page, graticule, now) : null;
  const advice = place && engineLoaded() ? adviceOf(fix, place, spots, now) : null;
  const speakOn = usePreferences((s) => s.speakAlerts);
  const said = useRef("");
  useEffect(() => {
    if (!advice || advice.key === said.current) return;
    said.current = advice.key;
    if (speakOn && advice.spoken) speak(advice.spoken);
  }, [advice, speakOn]);
  const note = !pdf
    ? "This diagram can't be read to place the airplane on it."
    : text.isError
      ? "The diagram's labels couldn't be read, so the airplane isn't drawn."
      : page && !graticule
        ? "This diagram has no latitude and longitude marks to place the airplane by."
        : !fix
          ? "Turn on your position to see the airplane on the diagram."
          : page && !mark
            ? "Your fix is too old or coarse, or off this diagram, so the airplane isn't drawn."
            : null;
  return { mark, rings: spots, advice, note };
}
