import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { SheetCard } from "../../../../components/SheetCard";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { NotamGlyph } from "./NotamGlyph";
import { Badge } from "../../../../components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { TEXT } from "../../../../lib/text";
import {
  headingOf,
  localWords,
  readNotam,
  useFieldNotams,
  whatOf,
  whenLine,
  whenWords,
  windowOf,
  type FieldNotam,
  type NotamReading,
  type FieldNotams,
} from "./fieldNotams";

/** The NOTAMs section's test id. */
const SECTION = "place-notams";

/**
 * A NOTAM's lines in our words, under its what: when (in the device's own
 * time) and where on the field, each the engine's (notam_read) and each on
 * its own line, the where only where the engine can say it (the owner,
 * 2026-11-11: "title(what), when, where ... on different lines"; then "Why
 * is not needed"). Where the engine has no what, the NOTAM's words written
 * out stand first.
 */
function NotamLines({ n, read, clamp }: { n: FieldNotam; read: NotamReading; clamp: boolean }) {
  const when = whenLine(n, read);
  return (
    <span className={cn("flex flex-col gap-0.5", n.in_force === false && "text-muted-foreground")}>
      {(!read.what || n.kind === "tfr") && (
        <span className={cn(clamp && "line-clamp-2")} data-testid="place-notam-words">
          {read.words}
        </span>
      )}
      {when && (
        <span className="text-muted-foreground tabular-nums" data-testid="place-notam-when">
          {when}
        </span>
      )}
      {read.where && (
        <span className="text-muted-foreground" data-testid="place-notam-where">
          {read.where}
        </span>
      )}
    </span>
  );
}

/**
 * One NOTAM in full, on a card of its own over the list: its what with
 * its Active or Inactive badge, its when and where as its row says them (NotamLines), its words with the
 * FAA's contractions written out where the what says them shorter, both
 * the engine's (notam_read); when it is in force in UTC, as the NOTAM gives
 * it, beside the device's own time; and its text as sent folded beneath,
 * never rewritten (raw reports as sent).
 */
export function NotamFull({ n, ident }: { n: FieldNotam; ident: string }) {
  const read = readNotam(n, ident);
  const when = windowOf(n, read);
  const utc = whenWords(when, read);
  const local = localWords(when.starts, when.ends);
  const ours = !!read.what && n.kind !== "tfr";
  return (
    <div className="flex flex-col gap-1 pb-6" data-testid="place-notam-full">
      {ours && (
        <p
          className={cn("flex items-start justify-between gap-2 font-medium", TEXT.prose, n.in_force === false && "text-muted-foreground")}
          data-testid="place-notam-what"
        >
          {read.what}
          <NotamState n={n} />
        </p>
      )}
      <p className={TEXT.prose}>
        <NotamLines n={n} read={read} clamp={false} />
      </p>
      {ours && <p className={cn("text-muted-foreground", TEXT.note)}>{read.words}</p>}
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

/**
 * The rows, as every list on the card has them (the owner, 2026-11-11:
 * "Notams show differently then other sections"): a grouped list, each
 * row its symbol, its what with its Active or Inactive badge, and its when and where (NotamLines), a tap opening it
 * in full (NotamFull) on a card over this one. Each asks the engine as it
 * draws, which a card's content waits for (SheetCard's one EngineGate).
 */
export function NotamRows({ notams, ident, state }: { notams: FieldNotam[]; ident: string; state: ReactNode }) {
  const [open, setOpen] = useState<FieldNotam | null>(null);
  return (
    <>
      <ListGroup>
        {state}
        {notams.map((n) => {
          const read = readNotam(n, ident);
          return (
            <ListRow
              key={n.id}
              media={<NotamGlyph keyword={read.keyword} tfr={n.kind === "tfr"} />}
              // Its what first, by its symbol, whether it is in force at the
              // line's end; its when and where a line each under it (NotamLines).
              wide
              title={
                <span className="flex items-start justify-between gap-2">
                  <span data-testid="place-notam-heading">{whatOf(n, ident)}</span>
                  <NotamState n={n} />
                </span>
              }
              description={<NotamLines n={n} read={read} clamp />}
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

/** Whether it is in force now: "Active" in red, "Inactive" in the
 *  caution's colours, as the card's NOTAM badges are (NotamBadge; the
 *  owner, 2026-11-11: "put a active and inactive badge on each notam").
 *  In force unless the planner says it is not yet (in_force false). */
function NotamState({ n }: { n: FieldNotam }) {
  const active = n.in_force !== false;
  return (
    <Badge
      variant={active ? "destructive" : "secondary"}
      className={cn("shrink-0", !active && "bg-caution-wash text-caution-ink")}
      data-testid="place-notam-state"
      data-active={active}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
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
 * title's right, and the title opening every one in place and closing
 * them again, as every list on the card does (FirstFew; the owner,
 * 2026-11-11: "Can notams also show as a list of three like others", then
 * "Notams should open like other sections").
 */
export function PlaceNotamsSection({ ident }: { ident: string }) {
  const { data, isError, total, shown, long, all, toggle } = useFieldNotams(ident);
  if (!data && !isError) return null;
  // "3 of 9" at the right while closed, as FirstFew's sections.
  const count = long && !all ? <span className={cn("text-muted-foreground", TEXT.note)}>{`${shown.length} of ${total}`}</span> : undefined;
  return (
    <div className="scroll-mt-16 pt-5" data-testid={SECTION}>
      <PillSection
        title="NOTAMs"
        testId="place-notams-first"
        onMore={long ? toggle : undefined}
        expanded={long ? all : undefined}
        right={count}
      >
        <NotamRows notams={shown} ident={ident} state={<NotamsState data={data} isError={isError} />} />
        <Unchecked data={data} />
      </PillSection>
    </div>
  );
}
