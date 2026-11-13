import { useState } from "react";
import { MoveUpRight } from "lucide-react";
import { cn } from "cn";
import CloseButton from "../../../components/CloseButton";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { SheetCard } from "../../../components/SheetCard";
import { Button } from "../../../components/ui/button";
import { NumberField } from "../../../components/ui/number-field";
import { WHOLE } from "../../../components/ui/numberFormats";
import { altitudeLines, fixRoles, type BranchFix } from "../../../lib/procedures";
import { TEXT } from "../../../lib/text";
import { altFt } from "../../../lib/format";
import { callEngine } from "../../../lib/engine/engine";
import { capitalised } from "../../../lib/advisories";

/** The fix whose card is open: its field, its procedure's name as the
 *  route's box says it, and the fix. */
export interface OpenFix {
  field: string;
  kind: "approach" | "arrival" | "departure";
  procedure: string;
  fix: BranchFix;
  direct: boolean;
  /** The pilot's own altitude to cross it at, feet; null, the chart's. */
  own: number | null;
}

/**
 * A procedure's fix, opened from its branch in FPL's list (FixBranch) or a
 * tap on it on the map (ProceduresGl), at the owner's pick (the fix
 * canvas's card): Direct to it, as ATC sends an airplane, or flown as
 * charted again; and the altitude to cross it at -- the chart's, and the
 * pilot's own in its place, typed in feet, or As charted. A card in the
 * map's panel over the search on every screen, its title on top and Close
 * (the one card rule, the owner 2026-11-10: on a desktop it was a popover
 * beside the panel, the search still showing, as RouteLegCard was).
 */
export default function FixCard({
  open,
  onClose,
  onDirect,
  onCross,
}: {
  open: OpenFix | null;
  onClose: () => void;
  onDirect: (open: OpenFix, direct: boolean) => void;
  onCross: (fix: string, feet: number | null) => void;
}) {
  if (!open) return null;
  return (
    <SheetCard
      title={open.fix.ident}
      onClose={onClose}
      testId="fix-card"
      action={<CloseButton onClick={onClose} data-testid="fix-card-close" />}
    >
      <div className="flex flex-col gap-3">
        <FixCardBody key={`${open.field}-${open.kind}-${open.fix.ident}`} open={open} onDirect={onDirect} onCross={onCross} />
      </div>
    </SheetCard>
  );
}

function FixCardBody({
  open,
  onDirect,
  onCross,
}: {
  open: OpenFix;
  onDirect: (open: OpenFix, direct: boolean) => void;
  onCross: (fix: string, feet: number | null) => void;
}) {
  const { fix, own, direct } = open;
  // As typed (React Aria's NumberField, in the pilot's locale).
  const [typed, setTyped] = useState<number | null>(own);
  const feet = typed ?? Number.NaN;
  // A VFR altitude, under Class A's floor (14 CFR 71.33, 91.135), as the
  // planner takes one: the engine's altitude_allowed.
  const valid = Number.isInteger(feet) && callEngine("altitude_allowed", { ft: feet });
  const charted = altitudeLines(fix).words;
  const roles = fixRoles(fix);
  return (
    <div className="flex flex-col gap-3">
      <p className={cn("text-center text-muted-foreground", TEXT.note)}>{[...roles, open.procedure, open.field].join(" · ")}</p>
      <Button
        type="button"
        size="lg"
        variant={direct ? "secondary" : "default"}
        onClick={() => onDirect(open, !direct)}
        className={cn("w-full", TEXT.row)}
        data-testid="fix-card-direct"
      >
        {direct ? (
          `Fly ${open.procedure} as Charted`
        ) : (
          <>
            <MoveUpRight className="size-5" aria-hidden /> Direct To {fix.ident}
          </>
        )}
      </Button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCross(fix.ident, feet);
        }}
      >
        <ListGroup>
          <ListRow title="Charted" value={charted ? capitalised(charted) : "None"} />
          <ListRow title={<label htmlFor="fix-cross">Cross at</label>}>
            <span className="flex items-center gap-1.5">
              <NumberField
                id="fix-cross"
                defaultValue={own}
                onTyped={setTyped}
                formatOptions={WHOLE}
                minValue={0}
                maxValue={99999}
                enterKeyHint="done"
                placeholder={own != null ? altFt(own) : "Feet"}
                className="h-9 w-24"
                inputClassName="text-right"
                aria-label={`Altitude to cross ${fix.ident} at, feet`}
                data-testid="fix-card-altitude"
              />
              <Button type="submit" size="sm" disabled={!valid || feet === own} data-testid="fix-card-set">
                Set
              </Button>
            </span>
          </ListRow>
          {own != null && <ListRow title="As charted" onClick={() => onCross(fix.ident, null)} data-testid="fix-card-charted" />}
        </ListGroup>
      </form>
    </div>
  );
}
