import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "cn";
import { ConsolePages, PageRow } from "../../../components/ConsolePages";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import StatusBadge from "../../../components/StatusBadge";
import { Spinner } from "../../../components/ui/spinner";
import { api } from "../../../lib/api/client";
import type { Status } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { TEXT } from "../../../lib/text";
import { AppsPage, RoutesPage } from "./AppHealthPages";
import { ChartsSection } from "./ChartsSection";
import { agoOrDate, DATASET_NAMES, waiting } from "./devWords";
import SpeedPage from "./SpeedPage";
import { StackLink } from "./StackLink";
import { type Dataset, DataPage, ErrorsPage, FeedsPage, ServicesPage, type ServiceRow } from "./SystemPages";
import { HEALTH, reported } from "./systemHealth";

/** Whether a snapshot is one the service worker served from its cache
 *  with the planner out of reach: its own clock says when it was taken,
 *  and one taken more than five minutes ago cannot be this half-minute's
 *  -- however fresh the response that carried it looked. */
const isStale = (status: Status | undefined) => !!status && Date.now() - new Date(status.checked_at).getTime() > 5 * 60_000;

export function SystemTab({
  status,
  failed,
  onRefresh,
  refreshing,
}: {
  status: Status | undefined;
  failed: boolean;
  /** Everything the console shows, asked for again now (DevPanel). */
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const stale = isStale(status);
  const queryClient = useQueryClient();
  // The one chart action: fetch and render the FAA's current cycle
  // now rather than at the planner's next daily check -- the same
  // subprocess either way, with its progress on the row below.
  const refreshCharts = useMutation({
    mutationFn: api.refreshCharts,
    onSuccess: (r) => {
      done(r.started ? `Fetching Charts ${r.current_cycle}` : "Charts Already Fetching");
      void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
  // Every row from the planner's one snapshot, which probed the others
  // -- the gateway's liveness and its readiness group (the database)
  // included -- and the planner itself by having answered. The browser
  // used to probe the gateway and the planner too, and on a phone those
  // requests queued behind the chart tiles on one HTTP/1.1 connection
  // pool, timed out at ten seconds, and read "no answer" for a gateway
  // that had just served the page.
  const services = status?.services;
  const rows: ServiceRow[] = [
    { name: "gateway (Spring Boot)", health: reported(services?.gateway, failed), detail: "sign-in, sessions, aircraft and flights" },
    { name: "db (Postgres)", health: reported(services?.db, failed), detail: "application data" },
    {
      name: "planner",
      health: reported(status ? { up: true } : null, failed),
      detail: "course, checkpoints and the chart model's scores, nav log, briefing, chart reading",
    },
  ];
  const host = window.location.hostname;
  const links: { label: string; href: string; localOnly?: boolean; service?: string; note?: string }[] = [
    { label: "gateway API docs", href: "/swagger-ui/index.html" },
    { label: "planner API docs", href: `http://${host}:8084/docs`, localOnly: true },
    { label: "Jupyter (the notebooks)", href: `http://${host}:8888`, localOnly: true, service: "ml" },
  ];

  // Every door, always. Two cleverer versions of this were wrong:
  // guessing from the hostname hid links that worked and showed links
  // that could not, and probing each one is impossible from here --
  // SecurityConfig's Content-Security-Policy sets `connect-src 'self'`,
  // so a cross-origin fetch to localhost:8084 is refused by the browser
  // before it is attempted, and loosening that header to allow a
  // liveness check is a bad trade for a tidier list.
  //
  // So the list is honest about what exists and the note below is
  // honest about what it takes to reach it.
  const shown: typeof links = [{ label: "This snapshot as JSON", href: "/api/planner/status" }, ...links];

  const datasets: Dataset[] = [
    ...(status?.faa_files ?? []).map((f) => ({
      name: DATASET_NAMES[f.name] ?? f.name,
      file: f.name.split("/").pop() ?? f.name,
      source: "FAA",
      updated: f.downloaded_at,
    })),
    ...(status?.weather ?? []).map((w) => ({
      name: DATASET_NAMES[w.name] ?? w.name,
      file: w.name,
      source: "aviationweather.gov",
      updated: w.fetched_at,
    })),
  ];

  // The FAA data sets past their cycle, said at the Reference data row's
  // end for the owner (wingtip.data_cycles).
  const staleData = (status?.data_cycles ?? []).filter((c) => c.state === "expired").length;
  // The live feeds stale now (app.feed_health), at the Live feeds row's end.
  const staleFeeds = (status?.feeds?.feeds ?? []).filter((f) => f.state === "stale").length;

  // At the services row's end, what is wrong if anything is: how many
  // are down or did not answer, in red, else how many are up; one the
  // deployment does not run is neither.
  const down = rows.filter((r) => r.health === "down" || r.health === "no answer").length;
  const summary = rows.some((r) => r.health === "checking")
    ? HEALTH.checking
    : down
      ? { tone: HEALTH.down.tone, label: `${down} down` }
      : { tone: HEALTH.up.tone, label: `${rows.filter((r) => r.health === "up").length} up` };

  // A row each that opens a page of its own (ConsolePages), as iOS's
  // Settings goes deeper: the services too, at the owner's ask
  // (2026-10-11), where they were a list on the tab's own page. They were
  // sections folded under their titles before that, and four tables at
  // once had been a screen and a half of scrolling.
  return (
    <ConsolePages
      back="Status"
      pages={{
        services: { title: "Services", content: <ServicesPage status={status} rows={rows} stale={stale} /> },
        data: { title: "Reference data", content: <DataPage status={status} failed={failed} datasets={datasets} /> },
        charts: {
          title: "Charts",
          content: status?.charts ? (
            <ChartsSection charts={status.charts} onRefresh={() => refreshCharts.mutate()} refreshing={refreshCharts.isPending} />
          ) : (
            <ListGroup>
              <ListRow muted title={<>{waiting(failed)}</>} />
            </ListGroup>
          ),
        },
        feeds: { title: "Live feeds", content: <FeedsPage status={status} failed={failed} /> },
        errors: { title: "Recent errors", content: <ErrorsPage status={status} failed={failed} /> },
        // Each planner route's calls, failures and times (app.route_metrics),
        // and the apps' faults and speed by build (AppHealthController):
        // the owner's status page, with the feeds' ages above.
        routes: { title: "Routes", content: <RoutesPage status={status} failed={failed} /> },
        apps: { title: "Apps", content: <AppsPage /> },
        // The web app's speed over time, under System at the owner's ask
        // (2026-10-11), where it was a tab of its own.
        speed: { title: "Speed", content: <SpeedPage /> },
        elsewhere: {
          title: "Elsewhere in the stack",
          content: (
            // docker-compose publishes the local ones on 127.0.0.1;
            // DEV_PUBLISH_ADDRESS publishes them to the network, Jupyter
            // with no password, which is why the file is to be read first.
            <ListGroup
              footer={
                <>
                  Each in a new tab. Those on this machine's ports open only where the stack runs;{" "}
                  <span className="font-mono">DEV_PUBLISH_ADDRESS</span> in docker-compose.yml publishes them (read it first).
                </>
              }
            >
              {shown.map((l) => (
                <StackLink key={l.href} link={l} />
              ))}
            </ListGroup>
          ),
        },
      }}
    >
      <div className="space-y-6">
        {stale && status && (
          // The service worker serves the last snapshot it has when the
          // planner is out of reach, and it arrives looking like an
          // answer; its own clock gives it away. Said here, and the
          // rows dimmed, rather than "up" in green for services that
          // may be anything by now.
          <p className={cn("px-1 text-caution-ink", TEXT.note)} data-testid="stale-snapshot">
            The planner has not answered since this snapshot, {agoOrDate(status.checked_at)}: what follows is what was true then.
          </p>
        )}
        <ListGroup>
          <PageRow page="services" title="Services" value={<StatusBadge tone={summary.tone}>{summary.label}</StatusBadge>} />
          {/* The count alone at the row's end: with the oldest's date as
              well the name wrapped on a phone. The page has the dates. */}
          <PageRow
            page="data"
            title="Reference data"
            value={
              !status ? undefined : staleData ? (
                <StatusBadge tone="down">{`${staleData} out of date`}</StatusBadge>
              ) : (
                `${datasets.length} files`
              )
            }
          />
          <PageRow page="charts" title="Charts" value={status?.charts ? `cycle ${status.charts.cycle}` : undefined} />
          <PageRow
            page="feeds"
            title="Live feeds"
            value={
              !status?.feeds ? undefined : staleFeeds ? (
                <StatusBadge tone="down">{`${staleFeeds} stale`}</StatusBadge>
              ) : (
                <StatusBadge tone="up">all fresh</StatusBadge>
              )
            }
          />
          <PageRow page="errors" title="Recent errors" value={status ? (status.recent_errors ?? []).length : undefined} />
          <PageRow page="routes" title="Routes" value={status ? (status.routes ?? []).length : undefined} />
          <PageRow page="apps" title="Apps" />
          <PageRow page="speed" title="Speed" />
          <PageRow page="elsewhere" title="Elsewhere in the stack" value={shown.length} />
        </ListGroup>
        {/* The services and the data are probed on a 30-second tick, and
            this asks now: an action row at the tab's foot, as the pilot
            asked, where it was an icon beside the tabs. */}
        <ListGroup>
          <ListRow
            media={refreshing ? <Spinner className="size-5" aria-hidden /> : <RefreshCw className="size-5" />}
            title="Check again"
            description="It checks by itself every 30 seconds"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="dev-refresh"
          />
        </ListGroup>
      </div>
    </ConsolePages>
  );
}
