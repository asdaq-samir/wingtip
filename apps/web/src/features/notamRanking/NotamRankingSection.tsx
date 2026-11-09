import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../components/Favorites";
import SourceChips from "../../components/SourceChips";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { Skeleton } from "../../components/ui/skeleton";
import { describeError } from "../../lib/api/client";
import type { RankedNotam } from "../../lib/api/types";
import { notamCredit, notamNone } from "../../lib/notamCoverage";
import { TEXT } from "../../lib/text";
import { useNotamRanking } from "./useNotamRanking";

/** One NOTAM: its line on why it bears on the flight, and its chip, which
 *  opens the NOTAM as sent. */
function Line({ notam, testId }: { notam: RankedNotam; testId: string }) {
  return (
    <li className="flex flex-col gap-1" data-testid={testId} data-notam={notam.id} data-worded={notam.worded ? "1" : undefined}>
      <p className={cn("tabular-nums", TEXT.prose, notam.in_force === false && "text-muted-foreground")}>{notam.why}</p>
      <SourceChips sources={[{ id: notam.id, label: notam.label, text: notam.raw }]} testId={`${testId}-source`} />
    </li>
  );
}

/**
 * The Brief's NOTAMs that matter (useNotamRanking): the top three the
 * engine ranked for this flight, each with its line and its chip, then
 * the rest folded under "N more", none dropped; the feed's coverage line
 * under them (lib/notamCoverage), and none heard said as such, never as
 * no NOTAMs. Where the briefer could not write the lines, the engine's
 * own reasons stand and a sentence says so, in place (lib/problems).
 */
export default function NotamRankingSection() {
  const { shown, top, rest, answer, error, pending } = useNotamRanking();
  if (!shown) return null;
  const since = answer?.coverage_since;
  return (
    <PillSection title="NOTAMs that matter" testId="brief-notams">
      {pending ? (
        <div className="flex flex-col gap-2 py-0.5" aria-busy="true" data-testid="brief-notams-pending">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="brief-notams-unavailable">
          {describeError(error, "The NOTAMs could not be ranked")}
        </p>
      ) : (
        <>
          {top.length === 0 && rest.length === 0 && (
            <p className={cn("text-muted-foreground", TEXT.prose)} data-testid="brief-notams-empty">{notamNone(since)}</p>
          )}
          {top.length > 0 && (
            <ol className="flex flex-col gap-3" data-testid="brief-notams-top">
              {top.map(n => <Line key={n.id} notam={n} testId="brief-notam" />)}
            </ol>
          )}
          {rest.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="group relative -ml-2 self-start text-tint after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']" data-testid="brief-notams-more">
                  {rest.length} more
                  <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ol className="flex flex-col gap-3 pt-1" data-testid="brief-notams-rest">
                  {rest.map(n => <Line key={n.id} notam={n} testId="brief-notam-folded" />)}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          )}
          {answer?.unavailable && (
            <p className={cn("text-muted-foreground", TEXT.note)} data-testid="brief-notams-unworded">
              The lines are the planner's own; the briefer could not be reached.
            </p>
          )}
          {answer?.unchecked.includes("tfrs") && (
            <p className={cn("text-muted-foreground", TEXT.note)} data-testid="brief-notams-unchecked">TFRs could not be checked just now.</p>
          )}
          <p className={cn("pb-2 text-muted-foreground", TEXT.note)} data-testid="brief-notams-credit">{notamCredit(since)}</p>
        </>
      )}
    </PillSection>
  );
}
