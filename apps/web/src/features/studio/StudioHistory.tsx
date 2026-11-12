import { ExternalLink } from "lucide-react";
import { cn } from "cn";
import { ListGroup } from "../../components/GroupedList";
import { Button, buttonVariants } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import type { StudioHistory } from "./useStudioHistory";

/** A raw report, as it was sent: monospaced, wrapped. */
function Raw({ children }: { children: string }) {
  return <pre className={cn("font-mono break-words whitespace-pre-wrap", TEXT.note)}>{children}</pre>;
}

/** The weather at the replay's moment: each field's METAR in force, its
 *  TAFs over the flight, raw as they were sent, and the radar's frame time. */
export function WeatherThen({ history }: { history: StudioHistory }) {
  const { weather, metars, radar, weatherProblem } = history;
  if (weatherProblem) return <p className={cn("text-destructive", TEXT.note)}>{weatherProblem}</p>;
  if (!weather) return <p className={cn("text-muted-foreground", TEXT.note)}>Fetching the weather as it was…</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="studio-weather">
      {metars.length === 0 && <p className={cn("text-muted-foreground", TEXT.note)}>No METARs near the track at this moment.</p>}
      {metars.map((m) => (
        <Raw key={m.station}>{m.raw}</Raw>
      ))}
      {weather.tafs.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="link" size="inline" className={TEXT.note} />}>
            TAFs over the flight ({weather.tafs.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            {weather.tafs.map((t) => (
              <Raw key={`${t.station}${t.issued}`}>{t.raw}</Raw>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      <p className={cn("text-muted-foreground", TEXT.caption)}>
        {radar ? `Radar on the map: the ${radar.valid.slice(11, 16)}Z mosaic. ` : ""}
        {weather.credit}
      </p>
    </div>
  );
}

/**
 * The NTSB's events for the airplane that day (its bulk data, kept by
 * ingest): the number, date and place, the phase of flight, and the
 * probable cause or the preliminary narrative as the NTSB wrote it,
 * quoted and never reworded, with the case's report and docket a tap away.
 */
export function NtsbEvents({ history }: { history: StudioHistory }) {
  if (!history.ntsb.length)
    return <p className={cn("text-muted-foreground", TEXT.note)}>No NTSB event for this airplane within a day of this date.</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="studio-ntsb">
      {history.ntsb.map((e) => (
        <article key={e.ev_id} className="flex flex-col gap-1.5">
          <span className={cn("font-semibold", TEXT.row)}>
            {e.ntsb_no} · {e.date}
          </span>
          <span className={cn("text-muted-foreground", TEXT.note)}>
            {[e.city, e.state, e.country].filter(Boolean).join(", ")}
            {e.phase ? ` · ${e.phase}` : ""}
            {e.highest_injury ? ` · ${e.highest_injury}` : ""}
          </span>
          {e.probable_cause && (
            <>
              <span className={cn("font-semibold", TEXT.note)}>Probable cause, as the NTSB wrote it</span>
              <blockquote className={cn("border-l-2 border-border pl-3", TEXT.note)}>{e.probable_cause}</blockquote>
            </>
          )}
          {e.narrative && (
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="link" size="inline" className={TEXT.note} />}>
                {e.narrative_kind === "final" ? "The NTSB's narrative" : "The NTSB's preliminary narrative"}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <blockquote className={cn("border-l-2 border-border pl-3 whitespace-pre-wrap", TEXT.note)}>{e.narrative}</blockquote>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div className="flex flex-wrap gap-2">
            <a className={buttonVariants({ variant: "outline", size: "sm" })} href={e.carol_url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              NTSB report
            </a>
            {e.docket_url && (
              <a className={buttonVariants({ variant: "outline", size: "sm" })} href={e.docket_url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Docket
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/** The NOTAMs and TFRs in force at the replay's hour, from the day's
 *  snapshot ingest kept; "Not archived for this date" where none was. */
export function NotamsThen({ history }: { history: StudioHistory }) {
  const n = history.notams;
  if (!n) return null;
  if (!n.archived) return <p className={cn("text-muted-foreground", TEXT.note)}>Not archived for this date.</p>;
  if (!n.tfrs.length && !n.notams.length)
    return <p className={cn("text-muted-foreground", TEXT.note)}>None in force near the track at this hour.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="studio-notams">
      {n.tfrs.length > 0 && (
        <ListGroup title="TFRs">
          {n.tfrs.map((t) => (
            <div key={t.id} className="flex flex-col gap-1 px-3 py-2">
              <span className={cn("font-semibold", TEXT.note)}>{t.name}</span>
              {t.text && <Raw>{t.text}</Raw>}
            </div>
          ))}
        </ListGroup>
      )}
      {n.notams.map((m) => (
        <Raw key={m.id}>{m.text}</Raw>
      ))}
    </div>
  );
}
