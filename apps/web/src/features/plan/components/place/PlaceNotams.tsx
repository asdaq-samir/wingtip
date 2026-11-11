import { useQuery } from "@tanstack/react-query";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { SheetCard } from "../../../../components/SheetCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { TEXT } from "../../../../lib/text";
import {
  fieldAlerts,
  fieldNotamsQuery,
  localWords,
  readNotam,
  useFieldNotams,
  whenWords,
  windowOf,
  type FieldNotam,
  type FieldNotams,
} from "./fieldNotams";

/** The NOTAMs section's test id, which an alert scrolls to. */
const SECTION = "place-notams";

/**
 * What leads an airport's card, under its actions, as Maps puts its live
 * cards first and the phones' cards do: each NOTAM the engine marks as
 * closing the field or a runway, and each TFR within 5 nm, at most three,
 * in the problem ink, each in the engine's words (notam_read); a tap shows
 * it in the card's NOTAMs. Nothing where there is none, or while the
 * answer is on its way (the card's content waits for the engine).
 */
export function PlaceAlerts({ ident, onOpen }: { ident: string; onOpen: () => void }) {
  const { data } = useQuery(fieldNotamsQuery(ident));
  const alerts = fieldAlerts(data);
  if (!alerts.length) return null;
  const show = () => {
    onOpen();
    // The Info tab's section, once the tab is drawn.
    requestAnimationFrame(() => document.querySelector(`[data-testid="${SECTION}"]`)?.scrollIntoView({ block: "start" }));
  };
  return (
    <ul className="flex flex-col gap-2 pt-3" aria-label="Alerts" data-testid="place-alerts">
      {alerts.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={show}
            className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="place-alert"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive-ink" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className={cn("font-semibold text-destructive-ink", TEXT.row)}>{n.kind === "tfr" ? "TFR Nearby" : "Closed"}</span>
              <span className={cn("line-clamp-2", TEXT.note)}>{readNotam(n, ident).words}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One NOTAM as a pilot reads it: what it is about (its keyword as a
 * heading) and its words with the FAA's contractions written out, both the
 * engine's (notam_read); when it is in force in UTC, as the NOTAM gives it,
 * and in the device's own time; and its text as sent folded beneath, never
 * rewritten (raw reports as sent).
 */
function NotamRow({ n, ident }: { n: FieldNotam; ident: string }) {
  const read = readNotam(n, ident);
  const when = windowOf(n, read);
  const utc = whenWords(when, read);
  const local = localWords(when.starts, when.ends);
  return (
    <li className="flex flex-col gap-1" data-testid="place-notam" data-kind={n.kind}>
      <p className={cn("font-semibold", TEXT.row, n.in_force === false && "text-muted-foreground")} data-testid="place-notam-heading">
        {n.kind === "tfr" ? "TFR" : (read.heading ?? "NOTAM")}
      </p>
      <p className={cn(TEXT.prose, n.in_force === false && "text-muted-foreground")} data-testid="place-notam-words">
        {read.words}
      </p>
      {utc && <p className={cn("text-muted-foreground tabular-nums", TEXT.note)}>{utc}</p>}
      {local && (
        <p className={cn("text-muted-foreground tabular-nums", TEXT.note)} data-testid="place-notam-local">
          {local}
        </p>
      )}
      <Collapsible>
        <CollapsibleTrigger
          className={cn(
            "group relative inline-flex items-center gap-1 self-start font-medium text-tint outline-none after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
            TEXT.note,
          )}
        >
          {n.kind === "tfr" ? "TFR as Sent" : "As Sent"}
          <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className={cn("mt-1 rounded-md bg-muted/60 p-2 font-mono break-words whitespace-pre-wrap", TEXT.note)}>{n.raw}</pre>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** The rows. Each asks the engine as it draws, which a card's content
 *  waits for (SheetCard's one EngineGate). */
function NotamRows({ notams, ident }: { notams: FieldNotam[]; ident: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {notams.map((n) => (
        <NotamRow key={n.id} n={n} ident={ident} />
      ))}
    </ul>
  );
}

/** What is said of the list itself: that it could not be had, that none
 *  was heard since the feed's time (decision 0023, never "no NOTAMs"), and
 *  that the TFRs could not be read rather than that there are none. */
function NotamsState({ data, isError }: { data: FieldNotams | undefined; isError: boolean }) {
  return (
    <>
      {isError && <p className={cn("text-muted-foreground", TEXT.note)}>The NOTAMs could not be had just now.</p>}
      {data && !data.notams.length && (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="place-notams-none">
          {data.coverage_since ? `None heard since ${data.coverage_since}` : "None heard"}
        </p>
      )}
      {data && data.unchecked.length > 0 && (
        <p className={cn("text-caution-ink", TEXT.note)} data-testid="place-notams-unchecked">
          The TFR list could not be read: check the FAA's TFRs before flying.
        </p>
      )}
    </>
  );
}

/**
 * The field's NOTAMs in its card's Info tab: the engine's first three (its
 * ranking), each read for a pilot (NotamRow), how many in all at the
 * title's right, and the title the way to every one, on a card over this
 * one with the same rows, as every list on the card shows three and opens
 * the rest from its title (the owner, 2026-11-11: "Can notams also show as
 * a list of three like others and can we decipher them better?").
 */
export function PlaceNotamsSection({ ident }: { ident: string }) {
  const { data, isError, notams, first, more, listOpen, openList, closeList } = useFieldNotams(ident);
  if (!data && !isError) return null;
  const count = notams.length ? <span className={cn("text-muted-foreground tabular-nums", TEXT.note)}>{notams.length}</span> : undefined;
  return (
    <div className="scroll-mt-16 pt-5" data-testid={SECTION}>
      <PillSection title="NOTAMs" testId="place-notams-first" onMore={more ? openList : undefined} right={count}>
        <NotamsState data={data} isError={isError} />
        <NotamRows notams={first} ident={ident} />
      </PillSection>
      {listOpen && (
        <SheetCard title="NOTAMs" description={ident} onClose={closeList} testId="place-notams-all">
          <div className="flex flex-col gap-3 pb-6">
            <NotamsState data={data} isError={isError} />
            <NotamRows notams={notams} ident={ident} />
          </div>
        </SheetCard>
      )}
    </div>
  );
}
