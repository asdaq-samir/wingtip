import { useQuery } from "@tanstack/react-query";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../../../components/Favorites";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { faaWords } from "../../../../lib/advisories";
import { TEXT } from "../../../../lib/text";
import { fieldAlerts, fieldNotamsQuery, whenWords, type FieldNotam } from "./fieldNotams";

/** The NOTAMs section's test id, which an alert scrolls to. */
const SECTION = "place-notams";

/** The NOTAM's first words, in sentence case with its codes kept (the
 *  engine's faa_words, as the app sets the FAA's capitals): what it is
 *  about, before its text as sent. */
const plain = (n: FieldNotam) => faaWords(n.raw.split("\n")[0] ?? n.raw);

/**
 * What leads an airport's card, under its actions, as Maps puts its live
 * cards first and the phones' cards do: each NOTAM the engine marks as
 * closing the field or a runway, and each TFR within 5 nm, at most three,
 * in the problem ink; a tap shows it in the card's NOTAMs. Nothing where
 * there is none, or while the answer is on its way.
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
              <span className={cn("line-clamp-2", TEXT.note)}>{plain(n)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The field's NOTAMs in its card's Info tab, in the engine's order: each
 * one's words first, when it is in force in UTC with its day, and its text
 * as sent folded beneath (never rewritten, raw reports as sent). Where the
 * TFRs could not be read it says so rather than showing none; with none,
 * "None heard since" the feed's time (decision 0023), never "no NOTAMs".
 */
export function PlaceNotamsSection({ ident }: { ident: string }) {
  const { data, isError } = useQuery(fieldNotamsQuery(ident));
  if (!data && !isError) return null;
  const notams = data?.notams ?? [];
  return (
    <div className="scroll-mt-16 pt-5" data-testid={SECTION}>
      <PillSection
        title="NOTAMs"
        right={notams.length ? <span className={cn("text-muted-foreground tabular-nums", TEXT.note)}>{notams.length}</span> : undefined}
      >
        {isError && <p className={cn("text-muted-foreground", TEXT.note)}>The NOTAMs could not be had just now.</p>}
        {data && !notams.length && (
          <p className={cn("text-muted-foreground", TEXT.note)} data-testid="place-notams-none">
            {data.coverage_since ? `None heard since ${data.coverage_since}` : "None heard"}
          </p>
        )}
        {data && data.unchecked.length > 0 && (
          <p className={cn("text-caution-ink", TEXT.note)} data-testid="place-notams-unchecked">
            The TFR list could not be read: check the FAA's TFRs before flying.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {notams.map((n) => (
            <li key={n.id} className="flex flex-col gap-1" data-testid="place-notam" data-kind={n.kind}>
              <p className={cn(TEXT.prose, n.in_force === false && "text-muted-foreground")}>{plain(n)}</p>
              {whenWords(n) && <p className={cn("text-muted-foreground tabular-nums", TEXT.note)}>{whenWords(n)}</p>}
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
          ))}
        </ul>
      </PillSection>
    </div>
  );
}
