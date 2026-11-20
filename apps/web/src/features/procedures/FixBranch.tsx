import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import type { BranchFix } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import { FixList } from "./FixList";

/**
 * A procedure picked at a field, its fixes a branch off the route's line in
 * the order they are flown, as a git graph branches, at the owner's pick
 * ("expandable list of connected points like git graph", option 4 of the
 * fix canvas): folded to its name and how many fixes, open a row a fix
 * with its altitude -- the pilot's own to cross it at, in the tint, else
 * the chart's -- and Direct to it. Sent direct to one, the branch runs
 * straight there, the fixes before it greyed on a dashed spur, skipped. A
 * fix's row, or its altitude, opens its card (FixCard): the altitude set
 * there, as from the map. Folded and unfolded by the stock Collapsible.
 * Its head, after the field's runways, is the procedure's name with the
 * fold's arrow beside it, turning as it opens, its kind and its fixes said
 * under it, and at its right the button to pick another (`menu`,
 * ProcedureMenu), at the owner's ask ("Arrow next to the procedure should
 * rotate and expand it. The button on the right should be to reselect
 * another approach").
 */
export default function FixBranch({
  name,
  kind,
  menu,
  fixes,
  direct,
  crossings,
  onDirect,
  onOpen,
}: {
  /** The procedure, as the route's box names it ("ILS 22 · ELD"). */
  name: string;
  /** Its kind as the head says it ("Approach"), and the button to pick
   *  another of it. */
  kind: string;
  menu: ReactNode;
  fixes: BranchFix[];
  direct: string | null;
  /** The pilot's own altitudes to cross fixes at, by fix. */
  crossings: Record<string, number>;
  onDirect: (fix: string | null) => void;
  onOpen: (fix: string) => void;
}) {
  const count = fixes.length ? ` · ${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}` : "";
  return (
    <Collapsible data-testid="fix-branch" data-kind={kind.toLowerCase()}>
      <div className="flex min-h-11 items-center gap-2">
        {/* The procedure's mark, a branch's head. */}
        <span aria-hidden="true" className="flex w-6 shrink-0 justify-center">
          <span className="size-2.5 rotate-45 border-2 border-white bg-procedure outline outline-1 outline-procedure" />
        </span>
        {fixes.length > 0 ? (
          <CollapsibleTrigger
            aria-label={`${name}, its fixes`}
            data-testid="fix-branch-toggle"
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-start text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
            )}
          >
            <span className={cn("flex max-w-full items-center gap-1 font-semibold text-tint", TEXT.row)}>
              <span className="truncate">{name}</span>
              <ChevronRight className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-90" aria-hidden="true" />
            </span>
            <span className={cn("text-muted-foreground", TEXT.note)}>
              {kind}
              {count}
            </span>
          </CollapsibleTrigger>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className={cn("max-w-full truncate font-semibold", TEXT.row)}>{name}</span>
            <span className={cn("text-muted-foreground", TEXT.note)}>
              {kind}
              {count}
            </span>
          </div>
        )}
        {menu}
      </div>
      <CollapsibleContent>
        <FixList name={name} fixes={fixes} direct={direct} crossings={crossings} onDirect={onDirect} onOpen={onOpen} />
      </CollapsibleContent>
    </Collapsible>
  );
}
