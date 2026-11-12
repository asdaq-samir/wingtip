import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { SheetCard } from "../../../../components/SheetCard";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { Badge } from "../../../../components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { TEXT } from "../../../../lib/text";
import {
  headingOf,
  readNotam,
  useFieldNotams,
  numberOf,
  whatOf,
  whereOf,
  type FieldNotam,
  type NotamReading,
  type FieldNotams,
} from "./fieldNotams";
import { timeLines } from "./notamTimes";
import { TfrDetails } from "./TfrDetails";

/** The NOTAMs section's test id. */
const SECTION = "place-notams";

/**
 * A NOTAM's lines in our words, under its what: when (in the device's own
 * time) and where on the field, each the engine's (notam_read) and each on
 * its own line, the where only where the engine can say it (the owner,
 * 2026-11-11: "title(what), when, where ... on different lines"; then "Why
 * is not needed"). Where the engine has no what, the NOTAM's words written
 * out stand first. A TFR's where is its levels and where it is from the
 * field (tfr_read); its title's words, which said its dates again, are
 * not a line (the owner, 2026-11-12: "dates are twice").
 */
function NotamLines({ n, read }: { n: FieldNotam; read: NotamReading }) {
  const times = timeLines(n, read);
  const where = whereOf(n, read);
  return (
    <span className={cn("flex flex-col gap-0.5", n.in_force === false && "text-muted-foreground")}>
      {times.length > 0 && (
        // Labelled, as ForeFlight's list gives them (notamTimes).
        <span className="grid grid-cols-[auto_1fr] gap-x-2 tabular-nums" data-testid="place-notam-when">
          {times.map((t) => (
            <span key={t.label} className="contents">
              <span className="text-muted-foreground">{t.label}</span>
              <span>{t.value}</span>
            </span>
          ))}
        </span>
      )}
      {where && (
        <span className="text-muted-foreground" data-testid="place-notam-where">
          {where}
        </span>
      )}
    </span>
  );
}

/**
 * One NOTAM in full, on a card of its own over the list: its what with
 * its Active or Inactive badge, its when and where as its row says them
 * (NotamLines), its words with the FAA's contractions written out where
 * the what says them shorter, both the engine's (notam_read); a TFR's
 * place, instructions and whom to call (TfrDetails); and its text as sent
 * folded beneath, never rewritten (raw reports as sent). Its times are
 * said once, on its Since and Ends lines: the UTC line that said them
 * again is gone, the times as sent kept in its text (the owner,
 * 2026-11-12: "dates are twice once in the title and then we decode
 * them").
 */
export function NotamFull({ n, ident }: { n: FieldNotam; ident: string }) {
  const read = readNotam(n, ident);
  const ours = !!read.what && n.kind !== "tfr";
  return (
    <div className="flex flex-col gap-1 pb-6" data-testid="place-notam-full">
      <NotamState n={n} />
      <p className={cn("font-medium", TEXT.prose, n.in_force === false && "text-muted-foreground")} data-testid="place-notam-what">
        <NotamWhat what={whatOf(n, ident)} />
      </p>
      <p className={TEXT.prose}>
        <NotamLines n={n} read={read} />
      </p>
      {ours && <p className={cn("text-muted-foreground", TEXT.note)}>{read.words}</p>}
      {n.kind === "tfr" && <TfrDetails n={n} />}
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
              // Its Active or Inactive badge where a row's symbol is, the
              // title the line's whole width (the owner, 2026-11-11: "No
              // actually replace the notam symbol with active/inactive badge
              // instead").
              media={<NotamState n={n} />}
              // Its what first, by its symbol, whether it is in force at the
              // line's end; its when and where a line each under it (NotamLines).
              wide
              title={
                // Its number only on its own card (the owner, 2026-11-11: "what's
                // 11/439", then "Full card is fine").
                <span className={cn(!read.what && n.kind !== "tfr" && "line-clamp-3")}>
                  <NotamWhat what={whatOf(n, ident)} />
                </span>
              }
              description={<NotamLines n={n} read={read} />}
              chevron
              onClick={() => setOpen(n)}
              data-testid="place-notam"
              data-kind={n.kind}
            />
          );
        })}
      </ListGroup>
      {open && (
        <SheetCard
          title={headingOf(open, ident)}
          description={`NOTAM ${numberOf(open, ident)}`}
          onClose={() => setOpen(null)}
          testId="place-notam-card"
        >
          <NotamFull n={open} ident={ident} />
        </SheetCard>
      )}
    </>
  );
}

/** The words in red where they stand in a NOTAM's first line, and no
 *  other (the owner, 2026-11-11: "just the word closed and 'out of service'
 *  should be red and nothing else of the wording"). */
const RED = /(\bclosed\b|\bout of service\b)/i;

/** Its first line, "closed" and "out of service" in red where they are in
 *  it, the rest in the text's colour. */
function NotamWhat({ what }: { what: string }) {
  return (
    <span data-testid="place-notam-heading">
      {what.split(RED).map((part, i) =>
        // split with a group: every odd part is a match.
        i % 2 ? (
          <span key={i} className="text-destructive-ink" data-testid="place-notam-condition">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

/** Whether it is in force now: "Active" in red, "Inactive" in the muted
 *  colours (the owner, 2026-11-11: "put a active and inactive badge on
 *  each notam").
 *  In force unless the planner says it is not yet (in_force false). */
function NotamState({ n }: { n: FieldNotam }) {
  const active = n.in_force !== false;
  return (
    <Badge
      // Inactive in the disabled colours: nothing to act on yet (the owner,
      // 2026-11-11: "Inactive notam can be disabled color").
      variant={active ? "destructive" : "secondary"}
      className={cn("w-fit shrink-0", !active && "text-muted-foreground")}
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

/** The NOTAMs by what they are about, the engine's heading (notam_read:
 *  Runway, Taxiway, Obstacle ...; a TFR's "TFR"), each kind where its
 *  first NOTAM ranks. */
function kindsOf(notams: FieldNotam[], ident: string): [string, FieldNotam[]][] {
  const kinds = new Map<string, FieldNotam[]>();
  for (const n of notams) {
    const kind = n.kind === "tfr" ? "TFR" : (readNotam(n, ident).heading ?? "Other");
    kinds.set(kind, [...(kinds.get(kind) ?? []), n]);
  }
  return [...kinds];
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
        {/* Opened, every one in the stock Collapsible's content, under its
            kind (Runway, Taxiway, Obstacle ...), the kinds in the order
            their first NOTAM ranks, as ForeFlight heads its list's groups
            (the owner's screenshots, 2026-11-11). */}
        {!(all && long) && <NotamRows notams={shown} ident={ident} state={<NotamsState data={data} isError={isError} />} />}
        {long && (
          <CollapsibleContent className="flex flex-col gap-2">
            {kindsOf(shown, ident).map(([kind, group]) => (
              <div key={kind} className="flex flex-col gap-1" data-testid="place-notams-kind">
                <span className={cn("px-1 text-muted-foreground", TEXT.note)}>{kind}</span>
                <NotamRows notams={group} ident={ident} state={null} />
              </div>
            ))}
          </CollapsibleContent>
        )}
        <Unchecked data={data} />
      </PillSection>
    </div>
  );
}
