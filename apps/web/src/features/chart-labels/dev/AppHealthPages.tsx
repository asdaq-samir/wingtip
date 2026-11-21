import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import Segmented from "../../../components/Segmented";
import { api, errorMessage } from "../../../lib/api/client";
import type { Status } from "../../../lib/api/types";
import { faultsByBuild, faultWords, figuresByBuild, PLATFORM_NAMES, routeWords } from "./appHealth";
import { agoOrDate, waiting } from "./devWords";

const SPANS = [
  { value: "1", label: "A day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

/** The Apps page: each build's crashes, hangs and other faults, and its
 *  headline speed figures, from the reports the apps send with nothing of
 *  the pilot's (AppHealthController). */
export function AppsPage() {
  const [span, setSpan] = useState("7");
  const { data, error } = useQuery({ queryKey: ["appVersions", span], queryFn: () => api.appVersions(Number(span)), staleTime: 60_000 });
  const faults = data ? faultsByBuild(data.faults) : [];
  const figures = data ? figuresByBuild(data.figures) : [];
  const note = error
    ? `The builds did not load: ${errorMessage(error, "the server gave no reason")}.`
    : !data
      ? "Reading the builds…"
      : null;
  return (
    <div className="flex flex-col gap-5">
      <ListGroup footer="Only from devices whose Help Improve Wingtip Maps is on; the web's speed from a quarter of page loads.">
        <ListRow title="Over">
          <Segmented label="Over" value={span} onChange={setSpan} options={SPANS} />
        </ListRow>
      </ListGroup>
      {note && (
        <ListGroup>
          <ListRow muted title={<span role="status">{note}</span>} />
        </ListGroup>
      )}
      {data && (
        <ListGroup title="Faults by build">
          {faults.map((b) => (
            <ListRow
              key={`${b.platform} ${b.version}`}
              title={`${PLATFORM_NAMES[b.platform] ?? b.platform} ${b.version}`}
              description={faultWords(b)}
              value={agoOrDate(b.lastAt)}
            />
          ))}
          {faults.length === 0 && <ListRow muted title="None in this time." />}
        </ListGroup>
      )}
      {data && (
        <ListGroup title="Speed by build" footer="Each figure's 75th percentile.">
          {figures.map((b) => (
            <ListRow key={`${b.platform} ${b.version}`} title={`${b.platform} ${b.version}`} description={b.words} value={`${b.reports}`} />
          ))}
          {figures.length === 0 && <ListRow muted title="None in this time." />}
        </ListGroup>
      )}
    </div>
  );
}

/** The Routes page: each planner route's calls, failures and times since
 *  the planner started (app.route_metrics), the busiest first. */
export function RoutesPage({ status, failed }: { status: Status | undefined; failed: boolean }) {
  const routes = status?.routes ?? [];
  return (
    <ListGroup footer="Since the planner last started; a failure is an answer of 500 or more.">
      {routes.map((r) => (
        <ListRow
          key={`${r.method} ${r.route}`}
          title={
            <span className="font-mono break-all">
              {r.method} {r.route}
            </span>
          }
          description={routeWords(r)}
        />
      ))}
      {routes.length === 0 && <ListRow muted title={<>{status ? "No calls yet." : waiting(failed)}</>} />}
    </ListGroup>
  );
}
