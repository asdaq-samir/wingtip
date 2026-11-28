import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import AccordionSection from "../../components/AccordionSection";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { describeError } from "../../lib/api/client";
import type { AlternateCheck } from "../../lib/api/types";
import { useAddressKey } from "../../lib/address";
import { ceilingAndVisibility } from "../plan";
import { useAlternate, type AlternateWhere } from "./useAlternate";
import { FieldError } from "../../components/ui/field";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, FOLD_PANEL } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import { callEngine } from "../../lib/engine/engine";
import { safeHref } from "../../lib/safeHref";

function standing(check: AlternateCheck): string {
  return check.good === true
    ? `Meets ${check.minimums?.ceiling_ft}-${check.minimums?.visibility_sm}`
    : check.good === false
      ? "Under its minimums"
      : "Check it";
}

/**
 * A field that will do as the alternate: a tap on its row folds open what
 * is known of it -- where it stands against its alternate minimums at the
 * ETA there, why, its TAF as sent and its published minimums -- and only
 * its File chip at the row's end files it, where the whole row filed it
 * at a tap meant to look (the owner, 2026-11-25: "it should be very clear
 * what's happening with the tap").
 */
function Suggestion({ check, onFile }: { check: AlternateCheck; onFile: () => void }) {
  return (
    <Collapsible data-testid={`alternate-suggestion-${check.ident}`}>
      <div className="flex min-h-11 items-center gap-2 pr-3">
        <CollapsibleTrigger
          className="group/fold flex min-w-0 flex-1 items-center gap-2 rounded-lg py-3.25 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:active:bg-muted"
          data-testid={`alternate-look-${check.ident}`}
        >
          <span className="min-w-0 flex-1">
            <span className={cn("block", TEXT.row)}>{check.ident}</span>
            <span className={cn("block text-muted-foreground", TEXT.detail)}>
              {`${check.distance_nm} nm · ${check.precision ? "ILS" : "nonprecision"} · ${ceilingAndVisibility(check.ceiling_ft, check.visibility_sm)}`}
            </span>
            {/* One to check before it is filed says so folded too, as its
                chip said "Check, file": its own minimums, or under them. */}
            {check.good !== true && (
              <span className={cn("block", TEXT.detail, check.good === false ? "font-semibold text-destructive" : "text-caution-ink")}>
                {standing(check)}
              </span>
            )}
          </span>
          {/* iOS's disclosure: a chevron to the right that turns down as it opens. */}
          <ChevronRight
            className="size-4 shrink-0 text-tint transition-transform duration-(--motion-fade) ease-(--motion-sheet-ease) group-data-panel-open/fold:rotate-90"
            aria-hidden
          />
        </CollapsibleTrigger>
        <Button variant="tint" size="chip" onClick={onFile} data-testid={`alternate-file-${check.ident}`}>
          File
        </Button>
      </div>
      <CollapsibleContent className={FOLD_PANEL} data-testid={`alternate-detail-${check.ident}`}>
        <div>
          <div className={cn("space-y-1 px-3 pb-3", TEXT.detail)}>
            <p className={cn(check.good === false && "font-semibold text-destructive")}>{standing(check)}</p>
            {check.reasons.length > 0 && <p>{check.reasons.join(" ")}</p>}
            <p className={cn("font-mono break-words", !check.taf && "font-sans text-muted-foreground")}>{check.taf ?? "No TAF"}</p>
            {check.alternate_minimums_url && (
              <Button
                variant="link"
                size="inline"
                className="relative hit-y-3"
                render={
                  <a href={safeHref(check.alternate_minimums_url)} target="_blank" rel="noreferrer" aria-label="Its Alternate Minimums" />
                }
                nativeButton={false}
              >
                Its Alternate Minimums
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Under IFR, the Weather tab's Alternate: whether the destination needs
 * one -- the "1-2-3" of 14 CFR 91.169(b), its approach and its TAF an hour
 * either side of the ETA -- the one filed, checked at the ETA there
 * against its alternate minimums (91.169(c)), and the nearest fields with
 * a TAF that will do, each opened with a tap and filed with its chip. The fuel on to the one filed
 * is the nav log's (91.167(a)(2)).
 */
export default function AlternateSection(where: AlternateWhere) {
  const { filed, data, isPending, error } = useAlternate(where);
  const [, setAlternate] = useAddressKey("alternate");
  const file = (ident: string | null) => void setAlternate(ident || null);
  return (
    <AccordionSection title="Alternate">
      <div className="space-y-4" data-testid="alternate">
        {!where.eta ? (
          <p className="text-muted-foreground">Checked once the nav log has an ETA.</p>
        ) : isPending ? (
          <p className="text-muted-foreground" role="status">
            Fetching the destination&apos;s forecast…
          </p>
        ) : error ? (
          <FieldError className={cn("text-destructive", TEXT.prose)}>The alternate could not be checked: {describeError(error)}</FieldError>
        ) : (
          data && (
            <>
              <ListGroup title="Destination">
                <ListRow
                  title={data.destination.required ? "An alternate is required" : "No alternate required"}
                  description={
                    data.destination.required ? data.destination.reasons.join(" ") : callEngine("ifr_alternate_not_required", {})
                  }
                  value={ceilingAndVisibility(data.destination.ceiling_ft, data.destination.visibility_sm)}
                  data-testid="alternate-destination"
                />
                {/* Its TAF as sent, a row of its own as a METAR's is, where it was a footnote. */}
                <ListRow
                  title={
                    data.destination.taf ? (
                      <span className="font-mono break-words">{data.destination.taf}</span>
                    ) : (
                      <span className="text-muted-foreground">No TAF for the destination</span>
                    )
                  }
                  data-testid="alternate-destination-taf"
                />
              </ListGroup>
              {data.alternate && (
                <ListGroup title="Filed">
                  <ListRow
                    title={data.alternate.ident}
                    description={
                      data.alternate.reasons.length
                        ? data.alternate.reasons.join(" ")
                        : `${data.alternate.distance_nm} nm on; ${data.alternate.precision ? "an ILS" : "a nonprecision approach"}, its minimums at the ETA there (14 CFR 91.169(c)).`
                    }
                    value={
                      <span className={cn(data.alternate.good === false && "font-semibold text-destructive")}>
                        {standing(data.alternate)}
                      </span>
                    }
                    data-testid="alternate-filed"
                  >
                    {/* Taken off by its own chip, as a suggestion is filed by
                        one, not a row of its own (the owner, 2026-11-25). */}
                    <Button variant="tint" size="chip" onClick={() => file(null)} data-testid="alternate-remove">
                      Take It Off
                    </Button>
                  </ListRow>
                  {data.alternate.taf && <ListRow title={<span className="font-mono break-words">{data.alternate.taf}</span>} />}
                  {data.alternate.alternate_minimums_url && (
                    <ListRow title="Its Alternate Minimums" href={data.alternate.alternate_minimums_url} chevron />
                  )}
                </ListGroup>
              )}
              {/* Fields with a TAF near enough, at or above their alternate
                minimums at the ETA there (the engine's ifr_alternate_check,
                14 CFR 91.169(c)); those that publish their own after, for the
                pilot to check against them. */}
              <ListGroup title="Alternates That Will Do">
                {data.suggestions.length === 0 ? (
                  <ListRow title="None found" description="File one you have checked yourself." />
                ) : (
                  data.suggestions
                    .filter((s) => s.ident !== filed)
                    .map((s) => <Suggestion key={s.ident} check={s} onFile={() => file(s.ident)} />)
                )}
              </ListGroup>
              {/* The forecasts are the TAFs, their TEMPO and PROB groups counted. */}
            </>
          )
        )}
      </div>
    </AccordionSection>
  );
}
