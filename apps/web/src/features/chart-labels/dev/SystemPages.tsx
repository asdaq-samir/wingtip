import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import StatusBadge from "../../../components/StatusBadge";
import type { Status } from "../../../lib/api/types";
import { agoOrDate, DATASET_NAMES, waiting } from "./devWords";
import { HEALTH, type Health } from "./systemHealth";

type Snapshot = { status: Status | undefined; failed: boolean };

export interface ServiceRow {
  name: string;
  health: Health;
  detail: string;
}

export interface Dataset {
  name: string;
  file: string;
  source: string;
  updated: string | null | undefined;
}

/** The Services page. */
export function ServicesPage({ status, rows, stale }: { status: Status | undefined; rows: ServiceRow[]; stale: boolean }) {
  return (
    // As the planner found them a moment ago: the gateway and its
    // database through Spring's actuator, the planner by
    // answering. A row a service, its role under its name and the
    // status at its end; when the snapshot was taken under them.
    <ListGroup
      className={cn(stale && "opacity-60")}
      footer={
        status && (
          <>
            Checked {agoOrDate(status.checked_at)}
            {stale && " — the planner has not answered since"}.
          </>
        )
      }
    >
      {rows.map((r) => (
        <ListRow key={r.name} title={r.name} description={r.detail}>
          <StatusBadge tone={HEALTH[r.health].tone}>{HEALTH[r.health].label}</StatusBadge>
        </ListRow>
      ))}
    </ListGroup>
  );
}

/** The Reference data page. */
export function DataPage({ status, failed, datasets }: Snapshot & { datasets: Dataset[] }) {
  return (
    // When it was fetched -- the one thing looked for -- at the
    // row's end, and the file and its source under its name.
    <div className="flex flex-col gap-5">
      <ListGroup footer="The files the planner reads and how old each copy is.">
        {datasets.map((d) => (
          <ListRow
            key={d.file}
            title={d.name}
            description={
              <>
                <span className="font-mono">{d.file}</span> · {d.source}
              </>
            }
            value={d.updated ? agoOrDate(d.updated) : "not fetched yet"}
          />
        ))}
        {datasets.length === 0 && <ListRow muted title={<>{status ? "Nothing on disk yet." : waiting(failed)}</>} />}
      </ListGroup>
      {/* Each FAA data set's edition against its cycle (the
          engine's data_cycle): with the refreshes off in
          production, an edition out of date is the owner's to
          fetch, and the planner logs it as well. */}
      {!!status?.data_cycles?.length && (
        <ListGroup title="FAA cycles">
          {status.data_cycles.map((c) => (
            <ListRow
              key={c.key}
              title={c.name}
              description={`${c.kind.toUpperCase()} · edition ${c.edition ?? "unknown"} · current ${c.current}`}
              value={
                <StatusBadge tone={c.state === "in_force" ? "up" : c.state === "expired" ? "down" : "checking"}>
                  {c.state === "expired" ? `${c.behind} behind` : c.state.replace("_", " ")}
                </StatusBadge>
              }
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

/** The Live feeds page. */
export function FeedsPage({ status, failed }: Snapshot) {
  return (
    // Each live feed as the planner checked it this minute
    // (app.feed_health): SWIM's through ingest's beats, each
    // weather product through the weather service. A feed stale
    // for the alert's minutes reads "alert" and is logged.
    <div className="flex flex-col gap-5">
      {(["swim", "weather"] as const).map((kind) => {
        const feeds = (status?.feeds?.feeds ?? []).filter((f) => f.kind === kind);
        return (
          <ListGroup
            key={kind}
            title={kind === "swim" ? "FAA SWIM" : "Weather"}
            footer={
              kind === "weather" && status?.feeds
                ? `Checked each minute; a feed stale ${status.feeds.alert_after_min} minutes is an alert${status.feeds.webhook ? ", posted to the webhook" : ""}.`
                : undefined
            }
          >
            {feeds.map((f) => (
              <ListRow
                key={f.name}
                title={DATASET_NAMES[f.name] ?? f.name}
                description={`${f.kind === "swim" ? `${f.what} · ` : ""}${f.detail ?? ""}${
                  f.stale_since ? ` · stale since ${agoOrDate(f.stale_since)}` : ""
                }`}
                value={
                  <StatusBadge tone={f.state === "ok" ? "up" : f.state === "stale" ? "down" : "checking"}>
                    {f.alerting ? "alert" : f.state}
                  </StatusBadge>
                }
              />
            ))}
            {feeds.length === 0 && <ListRow muted title={<>{status ? "None reported." : waiting(failed)}</>} />}
          </ListGroup>
        );
      })}
    </div>
  );
}

/** The Recent errors page. */
export function ErrorsPage({ status, failed }: Snapshot) {
  return (
    // What the planner failed at lately, the newest first: the call
    // a pilot made, its status and its words (app.errors).
    <ListGroup footer="The planner's last 50 answers of 500 or more since it started, and the exceptions no handler caught.">
      {(status?.recent_errors ?? []).map((e, i) => (
        <ListRow
          key={`${e.at}-${i}`}
          title={
            <span className="font-mono break-all">
              {e.method} {e.path}
            </span>
          }
          description={e.detail}
          value={
            <span className="whitespace-nowrap">
              {e.status} · {agoOrDate(new Date(e.at * 1000).toISOString())}
            </span>
          }
        />
      ))}
      {(status?.recent_errors ?? []).length === 0 && (
        <ListRow muted title={<>{status ? "None since the planner started." : waiting(failed)}</>} />
      )}
    </ListGroup>
  );
}
