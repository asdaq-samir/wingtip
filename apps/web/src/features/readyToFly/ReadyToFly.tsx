import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import FindingIcon from "../../components/FindingIcon";
import { Spinner } from "../../components/ui/spinner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { dayWords } from "../../lib/dataCycles";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { CARD, TRIGGER } from "../../components/glanceLook";
import { useReadyToFly, type ReadyAnswer } from "./useReadyToFly";

type Ready = ReturnType<typeof useReadyToFly>;
type Item = ReadyAnswer["items"][number];

/** One action: its line, a tap that does the fix where the web can, the
 *  words alone where it cannot (the battery, a fix the phones have). Hit
 *  area 44 points by a pseudo-element, the row not grown for it. */
export function ReadyAction({ item, ready, onDone }: { item: Item; ready: Ready; onDone?: () => void }) {
  const can = ready.canFix(item.fix);
  const busy = ready.busy(item.fix);
  const icon = busy ? (
    <Spinner className="size-5 shrink-0 text-tint" role={undefined} aria-label={undefined} aria-hidden />
  ) : (
    <FindingIcon finding="caution" />
  );
  if (!can)
    return (
      <div className={cn("flex items-center gap-2.5", TEXT.row)} data-testid={`ready-action-${item.key}`}>
        {icon}
        <span className="min-w-0 flex-1">{item.line}</span>
      </div>
    );
  return (
    <Button
      variant="plain"
      size="inline"
      type="button"
      disabled={busy}
      onClick={() => {
        ready.run(item.fix!);
        onDone?.();
      }}
      data-testid={`ready-action-${item.key}`}
      className={cn(
        "relative flex w-full items-center gap-2.5 text-left font-medium text-tint outline-none after:absolute after:-inset-y-2.5 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-ring",
        TEXT.row,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{item.line}</span>
    </Button>
  );
}

/**
 * Ready to fly, the Brief's last part (docs/design/web.md §5: the checks
 * left before departure, after the verdict, decision 0012): one row, the
 * engine's line with its mark, folded (the owner, 2026-11-16: "How do we
 * make brief less cluttered?", where it was a card of three actions and a
 * second row, Every check, under it). Opened: the actions that each fix in
 * place, then every check with its line, its detail and where its limit
 * comes from, and the next FAA data cycle. A caution at most: the pilot
 * can always fly (warn, never limit).
 */
export function ReadyToFly() {
  const ready = useReadyToFly();
  const answer = ready.answer;
  if (!answer) return null;
  return (
    <Collapsible className={CARD} data-testid="ready-to-fly" data-finding={answer.finding}>
      <CollapsibleTrigger className={cn(TRIGGER, "items-center", TEXT.row)} data-testid="ready-all">
        <FindingIcon finding={answer.finding} className="size-5 shrink-0" />
        <span className={cn("min-w-0 flex-1 font-medium", FINDING_TONE[answer.finding])} data-testid="ready-line" role="status">
          {answer.line}
        </span>
        <ChevronRight className="size-5 shrink-0 text-tint transition-transform group-data-panel-open:rotate-90" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3.5 pb-3">
        {answer.actions.map((item) => (
          <ReadyAction key={item.key} item={item} ready={ready} />
        ))}
        {answer.items.map((item) => (
          <div key={item.key} className="flex items-start gap-2" data-finding={item.finding}>
            <FindingIcon finding={item.finding} className="mt-0.5 size-4" />
            <span className={cn("min-w-0 flex-1", TEXT.detail)}>
              <span className="font-medium">{item.line}</span>
              <span className="block text-muted-foreground">
                {item.detail} ({item.source})
              </span>
            </span>
          </div>
        ))}
        <p className={cn("text-muted-foreground", TEXT.detail)} data-testid="ready-next-cycle">
          Next FAA data cycle {answer.next_cycle_ident}, {dayWords(answer.next_cycle)}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
