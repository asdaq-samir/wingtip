import { cn } from "cn";
import { Button } from "../../components/ui/button";
import FindingIcon from "../../components/FindingIcon";
import { Spinner } from "../../components/ui/spinner";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { dayWords } from "../../lib/dataCycles";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
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
        "relative flex w-full items-center gap-2.5 text-left font-medium text-tint outline-none hit-y-2.5 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-ring",
        TEXT.row,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{item.line}</span>
    </Button>
  );
}

/**
 * Ready to fly, on Preflight (docs/design/web.md §5: the checks left
 * before departure, after the verdict, decision 0012), where the Brief's
 * Before You Go row says how many are left (ReadyTodo) and opens it: one
 * grouped list (option A, the owner 2026-11-19; it was a fold of the
 * overview), the engine's line first, then the actions that each fix in
 * place, then every check with its line, its detail and where its limit
 * comes from, and the next FAA data cycle under it. A caution at most: the
 * pilot can always fly (warn, never limit).
 */
export function ReadyToFly() {
  const ready = useReadyToFly();
  const answer = ready.answer;
  if (!answer) return null;
  return (
    <div className="py-3 print:hidden" data-testid="ready-to-fly" data-title="Ready to Fly" data-finding={answer.finding}>
      <ListGroup
        title="Ready to Fly"
        footer={
          <span data-testid="ready-next-cycle">{`Next FAA data cycle ${answer.next_cycle_ident}, ${dayWords(answer.next_cycle)}`}</span>
        }
      >
        <ListRow
          media={<FindingIcon finding={answer.finding} />}
          title={
            <span className={cn("font-medium", FINDING_TONE[answer.finding])} data-testid="ready-line" role="status">
              {answer.line}
            </span>
          }
        />
        {/* Each action a row, the whole row its tap where the web can do
            the fix (in the tint, as an iOS row that acts), its words alone
            where it cannot (the battery, a fix the phones have). */}
        {answer.actions.map((item) => {
          const busy = ready.busy(item.fix);
          return (
            <ListRow
              key={item.key}
              media={
                busy ? (
                  <Spinner className="size-5 shrink-0 text-tint" role={undefined} aria-label={undefined} aria-hidden />
                ) : (
                  <FindingIcon finding="caution" />
                )
              }
              title={item.line}
              onClick={ready.canFix(item.fix) ? () => ready.run(item.fix!) : undefined}
              disabled={busy}
              data-testid={`ready-action-${item.key}`}
            />
          );
        })}
        {answer.items.map((item) => (
          <ListRow
            key={item.key}
            media={<FindingIcon finding={item.finding} />}
            // Its finding on its words: a plain row keeps only its test id.
            title={<span data-finding={item.finding}>{item.line}</span>}
            description={`${item.detail} (${item.source})`}
            data-testid={`ready-item-${item.key}`}
          />
        ))}
      </ListGroup>
    </div>
  );
}

/** How many are left to do on this device, the engine's own count (its
 *  checks not done), for the Brief's Before You Go row; "Ready" with none. */
export function ReadyTodo() {
  const answer = useReadyToFly().answer;
  if (!answer) return null;
  const left = answer.items.filter((i) => i.finding !== "ok").length;
  return (
    <span className={cn("font-semibold", FINDING_TONE[answer.finding])} data-testid="ready-todo">
      {left ? `${left} to do` : "Ready"}
    </span>
  );
}
