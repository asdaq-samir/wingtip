import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { altitudeLines, decorationOf, type BranchFix } from "../../lib/procedures";
import { fixSub } from "./procedureWords";
import { altFt } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { PointFigures, PointMenu } from "../route/lazy";

/** A fix's altitude at its row's end: the pilot's own to cross it at, in
 *  the tint, else the chart's, its line over or under it as drawn. */
export function FixFigures({ fix, own, time = null }: { fix: BranchFix; own: number | null; time?: ReactNode }) {
  const charted = altitudeLines(fix).lines[0] ?? null;
  return (
    <PointFigures
      time={time}
      kind={own != null ? "set" : "pub"}
      spoken={
        own != null
          ? `cross at ${altFt(own)} ft, set by you`
          : altitudeLines(fix).words
            ? `published, ${altitudeLines(fix).words}`
            : undefined
      }
      altitude={own != null ? altFt(own) : charted ? <span style={{ textDecoration: decorationOf(charted) }}>{charted.text}</span> : null}
    />
  );
}

/**
 * A picked procedure's fixes in the order they are flown, a branch off the
 * route's line as a git graph branches: a row a fix with its altitude --
 * the pilot's own to cross it at, in the tint, else the chart's -- and
 * Direct to it. Sent direct to one, the branch runs straight there, the
 * fixes before it greyed on a dashed spur, skipped. A fix's row, or its
 * altitude, opens its card (FixCard). FixBranch's open body; FPL's
 * timeline draws them on the route's own line (TimelineProcedureRows).
 */
export function FixList({
  name,
  fixes,
  direct,
  crossings,
  onDirect,
  onOpen,
}: {
  name: string;
  fixes: BranchFix[];
  direct: string | null;
  crossings: Record<string, number>;
  onDirect: (fix: string | null) => void;
  onOpen: (fix: string) => void;
}) {
  const directAt = direct ? fixes.findIndex((f) => f.ident === direct) : -1;
  return (
    <ol className="mt-1" aria-label={`${name}, its fixes`}>
      {fixes.map((fix, i) => {
        const skipped = directAt > 0 && i < directAt;
        const isDirect = i === directAt;
        const sub = fixSub(fix, isDirect, skipped);
        return (
          <li
            key={`${fix.ident}-${i}`}
            className={cn("relative flex min-h-12 items-center gap-2 pl-7", isDirect && "rounded-xl bg-tint/8")}
            data-testid="fix-branch-row"
          >
            {/* The branch's line and the fix's mark: dashed and hollow where
                skipped, a filled tint dot where the airplane is sent. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0 bottom-0 left-3 border-l-2",
                skipped ? "border-dashed border-muted-foreground/40" : "border-procedure",
                i === 0 && "top-1/2",
                i === fixes.length - 1 && "bottom-1/2",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1/2 left-3 -translate-x-[calc(50%-1px)] -translate-y-1/2",
                isDirect
                  ? "size-3.5 rounded-full border-2 border-white bg-tint"
                  : cn("size-2.5 rotate-45 border-2", skipped ? "border-muted-foreground/40 bg-background" : "border-white bg-procedure"),
              )}
            />
            <span className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
              <BaseButton
                onClick={() => onOpen(fix.ident)}
                className={cn("flex min-w-0 flex-1 flex-col justify-center self-stretch py-1 text-left", skipped && "opacity-50")}
              >
                <span className={cn("font-semibold", TEXT.row, isDirect && "text-tint")}>{fix.ident}</span>
                {sub && <span className={cn(TEXT.note, isDirect ? "font-semibold text-tint" : "text-muted-foreground")}>{sub}</span>}
              </BaseButton>
              <FixFigures fix={fix} own={crossings[fix.ident] ?? null} />
              <PointMenu
                ident={fix.ident}
                direct={isDirect}
                testId="fix-branch-menu"
                onDirect={() => onDirect(isDirect ? null : fix.ident)}
                onAltitude={() => onOpen(fix.ident)}
              />
              <span className="w-1 shrink-0" aria-hidden="true" />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
