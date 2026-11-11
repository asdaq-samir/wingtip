import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListGroup, ListRow } from "./GroupedList";
import type { MapLayerAges } from "../lib/api/types";
import { zuluTime } from "../lib/format";
import { useMinuteClock } from "../lib/useMinuteClock";
import { cycleWarning, dayWords } from "../lib/dataCycles";
import { savedWords, useSaved } from "../lib/fromCache";
import { useOnline } from "../lib/kept/useOnline";
import { ageWords, mapAgesQuery, staleWords, useLayerAges } from "../lib/map/sources/layerAges";
import { useCredits } from "../lib/map/gl/creditStore";
import { TEXT } from "../lib/text";

/**
 * The pilot's Status page, beside Guide and About, at the owner's ask
 * ("We should keep this info in a Status sheet next to About and Guide",
 * 2026-11-04): how old everything the plan rests on is, and what is kept
 * through a dropped connection. This phone's connection and whether the
 * page is showing answers the service worker kept (lib/fromCache); then
 * each source the planner downloads -- the METARs, TAFs, AIRMETs and
 * SIGMETs, G-AIRMETs, PIREPs, winds aloft and TFRs -- with when its copy
 * was fetched and, where the source is not answering, to when the copy
 * held is used by its product's own validity (wingtip.weather), and where
 * one has stopped coming in past its usual cadence -- the NOTAMs, the
 * radar and satellite frames among them -- that it is not updating (the
 * planner's feed watch, app.feeds.status_rows); and the traffic, as the
 * map last heard it. Asked again each minute while open.
 */
export default function StatusPanel() {
  const now = useMinuteClock();
  const online = useOnline();
  // What the page is showing from the service worker's cache, said here
  // and never on the map (lib/fromCache).
  const saved = savedWords(Object.values(useSaved((s) => s.saved)), now);
  // The map's settings ask the same question (useLayerAges), one answer
  // for both.
  const { data, isError } = useQuery(mapAgesQuery);
  const { traffic } = useLayerAges();
  // What each layer on the map says of its source and its currency -- the
  // overlay tiles' FAA cycle, the radar loop's source, the traffic's, old
  // field weather -- where the map's row of small print said it (the
  // owner, 2026-11-11: the row went, "Yes status works").
  const onMap = Object.values(useCredits((s) => s.credits));
  return (
    <div className="space-y-5 pb-1" data-testid="status-panel">
      <ListGroup title="Connection">
        <ListRow
          title="This phone"
          value={online ? "Online" : "Offline"}
          data-testid="status-connection"
          description={saved ? <span className={TEXT.detail}>{saved}</span> : undefined}
        />
      </ListGroup>

      <ListGroup title="Weather and TFRs">
        {data?.sources?.length ? (
          data.sources.map((s) => (
            <ListRow
              key={s.name}
              title={s.name}
              data-testid="status-source"
              value={ageWords(s.fetched_at ? Date.parse(s.fetched_at) : null, now) ?? "Not yet"}
              description={
                s.failing || s.stale ? (
                  <span className={cn("text-destructive-ink", TEXT.detail)}>
                    {s.failing ? failingWords(s) : staleWords(s.fetched_at, now)}
                  </span>
                ) : undefined
              }
            />
          ))
        ) : (
          <ListRow muted title={isError ? "The planner could not be reached" : "Checking…"} data-testid="status-sources-none" />
        )}
      </ListGroup>

      {/* Each FAA data set the plan rests on, by its edition, and where one
          is past its cycle, said under it in the row's own words (the
          engine's data_cycle, lib/dataCycles): an old edition reads as if
          nothing were wrong, so this is where a pilot checks. */}
      {!!data?.data_cycles?.length && (
        <ListGroup title="FAA Data">
          {data.data_cycles.map((c) => {
            const warning = cycleWarning(c);
            return (
              <ListRow
                key={c.key}
                title={c.name}
                value={dayWords(c.edition)}
                data-testid="status-data-cycle"
                data-cycle={c.state}
                description={warning ? <span className={cn("text-destructive-ink", TEXT.detail)}>{warning}</span> : undefined}
              />
            );
          })}
        </ListGroup>
      )}

      {onMap.length > 0 && (
        <ListGroup title="On the Map">
          {onMap.map((words) => (
            <ListRow key={words} title={words} data-testid="status-on-map" />
          ))}
        </ListGroup>
      )}

      <ListGroup title="Traffic">
        <ListRow title="Airplanes nearby" value={traffic ?? "None heard"} data-testid="status-traffic" />
      </ListGroup>
    </div>
  );
}

/** What a source that is not answering leaves the plan with: the copy
 *  held, to when it is used, or nothing. */
function failingWords(s: MapLayerAges["sources"][number]): string {
  if (!s.fetched_at) return "Not answering, and none held";
  if (!s.kept_until) return "Not answering: the last copy is used";
  const until = new Date(s.kept_until);
  return until.getTime() > Date.now()
    ? `Not answering: the last copy is used until ${zuluTime(until)}`
    : "Not answering: the last copy has run out";
}
