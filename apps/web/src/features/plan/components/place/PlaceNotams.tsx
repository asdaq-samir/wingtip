import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { SheetCard } from "../../../../components/SheetCard";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import { BADGE } from "../../../../lib/rowBadges";
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
 * One NOTAM in full, on a card of its own over the list: what it is about
 * (its keyword as a heading, the card's title) and its words with the
 * FAA's contractions written out, both the engine's (notam_read); when it
 * is in force in UTC, as the NOTAM gives it, and in the device's own time;
 * and its text as sent folded beneath, never rewritten (raw reports as
 * sent).
 */
function NotamFull({ n, ident }: { n: FieldNotam; ident: string }) {
  const read = readNotam(n, ident);
  const when = windowOf(n, read);
  const utc = whenWords(when, read);
  const local = localWords(when.starts, when.ends);
  return (
    <div className="flex flex-col gap-1 pb-6" data-testid="place-notam-full">
      <p className={cn(TEXT.prose, n.in_force === false && "text-muted-foreground")}>{read.words}</p>
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
    </div>
  );
}

/** A NOTAM's heading: its keyword (the engine's), "TFR" for a TFR. */
function headingOf(n: FieldNotam, ident: string): string {
  return n.kind === "tfr" ? "TFR" : (readNotam(n, ident).heading ?? "NOTAM");
}

/**
 * The rows, as every list on the card has them (the owner, 2026-11-11:
 * "Notams show differently then other sections"): a grouped list, each
 * row its badge, its heading and two lines of its words, a tap opening it
 * in full (NotamFull) on a card over this one. Each asks the engine as it
 * draws, which a card's content waits for (SheetCard's one EngineGate).
 */
function NotamRows({ notams, ident, state }: { notams: FieldNotam[]; ident: string; state: ReactNode }) {
  const [open, setOpen] = useState<FieldNotam | null>(null);
  return (
    <>
      <ListGroup>
        {state}
        {notams.map((n) => {
          const out = n.in_force === false;
          return (
            <ListRow
              key={n.id}
              media={
                <RowBadge colour={BADGE.hazard}>
                  <TriangleAlert />
                </RowBadge>
              }
              title={<span data-testid="place-notam-heading">{headingOf(n, ident)}</span>}
              description={
                <span className={cn("line-clamp-2", out && "text-muted-foreground")} data-testid="place-notam-words">
                  {readNotam(n, ident).words}
                </span>
              }
              chevron
              onClick={() => setOpen(n)}
              data-testid="place-notam"
              data-kind={n.kind}
            />
          );
        })}
      </ListGroup>
      {open && (
        <SheetCard title={headingOf(open, ident)} description={ident} onClose={() => setOpen(null)} testId="place-notam-card">
          <NotamFull n={open} ident={ident} />
        </SheetCard>
      )}
    </>
  );
}

/** What is said of the list itself, a row of the list as a section's
 *  "None listed" is: that it could not be had, that none was heard since
 *  the feed's time (decision 0023, never "no NOTAMs"). */
function NotamsState({ data, isError }: { data: FieldNotams | undefined; isError: boolean }) {
  if (isError) return <ListRow muted title="Could not be had just now" />;
  if (data && !data.notams.length)
    return (
      <ListRow
        muted
        title={data.coverage_since ? `None heard since ${data.coverage_since}` : "None heard"}
        data-testid="place-notams-none"
      />
    );
  return null;
}

/** That the TFRs could not be read rather than that there are none, under
 *  the list. */
function Unchecked({ data }: { data: FieldNotams | undefined }) {
  return data && data.unchecked.length > 0 ? (
    <p className={cn("pt-2 text-caution-ink", TEXT.note)} data-testid="place-notams-unchecked">
      The TFR list could not be read: check the FAA's TFRs before flying.
    </p>
  ) : null;
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
  // "3 of 9" at the right where there are more, as FirstFew's sections.
  const count = more ? <span className={cn("text-muted-foreground", TEXT.note)}>{`${first.length} of ${notams.length}`}</span> : undefined;
  return (
    <div className="scroll-mt-16 pt-5" data-testid={SECTION}>
      <PillSection title="NOTAMs" testId="place-notams-first" onMore={more ? openList : undefined} right={count}>
        <NotamRows notams={first} ident={ident} state={<NotamsState data={data} isError={isError} />} />
        <Unchecked data={data} />
      </PillSection>
      {listOpen && (
        <SheetCard title="NOTAMs" description={ident} onClose={closeList} testId="place-notams-all">
          <div className="flex flex-col pb-6">
            <NotamRows notams={notams} ident={ident} state={null} />
            <Unchecked data={data} />
          </div>
        </SheetCard>
      )}
    </div>
  );
}
