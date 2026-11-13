import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PillSection } from "../../components/Favorites";
import KeptAge from "../../components/KeptAge";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { Skeleton } from "../../components/ui/skeleton";
import { describeError } from "../../lib/api/client";
import { notamCredit, notamNone } from "../../lib/notamCoverage";
import { TEXT } from "../../lib/text";
import { useNotamRanking } from "./useNotamRanking";
import NotamLine from "./NotamLine";
import NotamToolbar from "./NotamToolbar";
import { useNotamMarks } from "./notamMarks";
import { ALL_NOTAMS, arrangeNotams } from "./notamView";

/**
 * The Brief's NOTAMs that matter (useNotamRanking): the top three the
 * engine ranked for this flight, each with its line and its chip, then
 * the rest folded under "N more", none dropped; the feed's coverage line
 * under them (lib/notamCoverage), and none heard said as such, never as
 * no NOTAMs.
 * Filtered, sorted, pinned and marked read as the pilot asks (web.md §6,
 * NotamToolbar, NotamLine): what the filters leave out is counted, with
 * Show All, so a NOTAM is folded or filtered by the pilot, never dropped.
 */
export default function NotamRankingSection() {
  const { shown, answer, error, pending, fetchedAt, failed } = useNotamRanking();
  const filter = useNotamMarks((s) => s.filter);
  const sort = useNotamMarks((s) => s.sort);
  const pinned = useNotamMarks((s) => s.pinned);
  const read = useNotamMarks((s) => s.read);
  const setFilter = useNotamMarks((s) => s.setFilter);
  if (!shown) return null;
  const all = answer?.notams ?? [];
  const { top, rest, hidden } = arrangeNotams(all, filter, sort, { pinned, read });
  const since = answer?.coverage_since;
  return (
    <PillSection title="NOTAMs that matter" testId="brief-notams">
      {pending ? (
        <div className="flex flex-col gap-2 py-0.5" aria-busy="true" data-testid="brief-notams-pending">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error && !answer ? (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="brief-notams-unavailable">
          {describeError(error, "The NOTAMs could not be ranked")}
        </p>
      ) : (
        <>
          {/* The ranking kept on this device, with its age, where it could
              not be asked again (no signal). */}
          <KeptAge kind="notams" atMs={fetchedAt} failed={failed} />
          {all.length > 0 && <NotamToolbar />}
          {hidden > 0 && (
            <p className={cn("flex items-center gap-2 text-muted-foreground", TEXT.note)} data-testid="brief-notams-hidden">
              {hidden} hidden by the filter
              <Button
                variant="ghost"
                size="sm"
                className="relative h-auto px-1 text-tint after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']"
                onClick={() => setFilter(ALL_NOTAMS)}
                data-testid="brief-notams-show-all"
              >
                Show All
              </Button>
            </p>
          )}
          {all.length === 0 && (
            <p className={cn("text-muted-foreground", TEXT.prose)} data-testid="brief-notams-empty">
              {notamNone(since)}
            </p>
          )}
          {top.length > 0 && (
            <ol className="flex flex-col gap-3" data-testid="brief-notams-top">
              {top.map((n) => (
                <NotamLine key={n.id} notam={n} testId="brief-notam" />
              ))}
            </ol>
          )}
          {rest.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group relative -ml-2 self-start text-tint after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
                    data-testid="brief-notams-more"
                  />
                }
              >
                {rest.length} more
                <ChevronDown className="transition-transform group-data-panel-open:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ol className="flex flex-col gap-3 pt-1" data-testid="brief-notams-rest">
                  {rest.map((n) => (
                    <NotamLine key={n.id} notam={n} testId="brief-notam-folded" />
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          )}
          {answer?.unchecked.includes("tfrs") && (
            <p className={cn("text-muted-foreground", TEXT.note)} data-testid="brief-notams-unchecked">
              TFRs could not be checked just now.
            </p>
          )}
          <p className={cn("pb-2 text-muted-foreground", TEXT.note)} data-testid="brief-notams-credit">
            {notamCredit(since)}
          </p>
        </>
      )}
    </PillSection>
  );
}
