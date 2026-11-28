import { cn } from "cn";
import { Button } from "../../components/ui/button";
import FindingIcon from "../../components/FindingIcon";
import { ListRow } from "../../components/GroupedList";
import { ItemGroup, ItemSeparator } from "../../components/ui/item";
import { AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { TEXT } from "../../lib/text";
import { Cited } from "../documents";
import type { PanelTab } from "../plan";
import type { glanceLines, GlanceLine } from "./glance";

/** A folding row of the Brief's grouped list, as tall as its other rows
 *  (ListRow's 44 at the least, 13 a side), Base UI Accordion's own
 *  chevron at its end in the tint. */
const FOLD = cn(
  "min-h-11 w-full items-start gap-2.5 rounded-none border-0 px-3 py-3.25 text-left hover:no-underline focus-visible:ring-offset-0",
  TEXT.row,
);
/** An item of the list: the list's own hairline between rows, none of its own. */
const ITEM = "not-last:border-b-0";

/** A page of the Brief, and the section on it where a finding is said in
 *  full (the overview's AdverseRows open theirs the same way). */
type Open = (tab: PanelTab, section?: string) => void;

/** A line a pilot acts on: the finding and what to do about it, in one
 *  sentence (features/brief/glance), the list's first rows, and under a
 *  tap what to do first, why it matters with the rule it rests on, the
 *  reports it was read from as sent, and the way to its section. Folded,
 *  since the owner's rule is to look and go: an item of the Brief's Base
 *  UI Accordion (docs/design/web.md §5, the APG's keys). */
export function Line({ line, onOpen }: { line: Omit<GlanceLine, "key"> & { key: string }; onOpen: Open }) {
  return (
    <AccordionItem value={line.key} className={ITEM} data-testid={`brief-line-${line.key}`} data-finding={line.finding}>
      <AccordionTrigger className={FOLD}>
        <FindingIcon finding={line.finding} className="mt-0.5 size-5 shrink-0" />
        {/* Two rows at most, the finding alone; what to do first under its tap. */}
        <span className="line-clamp-2 min-w-0 flex-1 font-normal" data-testid="brief-line-words" aria-label={line.line}>
          {line.lead}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-2 px-3 pb-3 pl-10.5" data-testid="brief-line-why">
        <p className={cn("font-semibold", TEXT.detail)} data-testid="brief-line-action">
          {line.action}
        </p>
        <p className={TEXT.detail}>
          <span className="font-semibold">Why it matters: </span>
          {/* Each cited rule a tap to its paragraph in the library. */}
          <Cited text={line.why} />{" "}
          <span className="text-muted-foreground">
            (<Cited text={line.cite} />)
          </span>
        </p>
        {line.raw.length > 0 && (
          <div className={cn("space-y-1 font-mono whitespace-pre-wrap text-muted-foreground", TEXT.note)} data-testid="brief-line-raw">
            {line.raw.map((r) => (
              <p key={r}>{r}</p>
            ))}
          </div>
        )}
        {/* To the finding's own section, not its page's top (the owner,
            2026-11-25: "it should be very clear what's happening with
            the tap"). */}
        <Button
          variant="link"
          size="inline"
          onClick={() => onOpen(line.tab, line.section ?? undefined)}
          className={cn("relative font-semibold no-underline! hit-x-2 hit-y-3", TEXT.detail)}
        >
          See It in Full
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

/** The rest of the findings folded into one row after the lines, each
 *  a row of the list's own look under it, its mark, its finding and the
 *  chevron, opening its section (the owner, 2026-11-25: "it should be
 *  very clear what's happening with the tap"), where they were lines of
 *  small text that did not read as taps. Set in under the fold's words,
 *  as a row's children are, a hairline between each. */
export function Rest({ rest, onOpen }: { rest: ReturnType<typeof glanceLines>["rest"]; onOpen: Open }) {
  return (
    <AccordionItem value="rest" className={ITEM} data-testid="brief-rest" data-finding={rest.finding}>
      <AccordionTrigger className={cn(FOLD, "items-center")}>
        <FindingIcon finding={rest.finding} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 font-normal" data-testid="brief-rest-words">
          {rest.line}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-0 pl-7.5">
        <ItemGroup role="group" className="gap-0">
          {rest.items.map((i) => [
            <ItemSeparator key={`${i.key}-rule`} className="my-0" />,
            <ListRow
              key={i.key}
              media={<FindingIcon finding={i.finding} className="size-5 shrink-0" />}
              title={i.label}
              description={i.detail}
              chevron
              onClick={() => onOpen(i.tab, i.section)}
              data-testid={`brief-rest-${i.key}`}
              data-finding={i.finding}
            />,
          ])}
        </ItemGroup>
      </AccordionContent>
    </AccordionItem>
  );
}
