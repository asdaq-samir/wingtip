import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PANEL_FIELD_FILL } from "../../components/panelField";
import { pointName } from "../../lib/identSchema";
import { TEXT } from "../../lib/text";

/** The course's magenta, as the plan's line and its marks. */
const COURSE = { borderColor: "var(--course)" } as const;

/**
 * FPL's route folded to one line to read (the one layout, the owner,
 * 2026-11-17, decision 0046; Route Line's ends, the owner's pick L1 of
 * 2026-11-05): the departure at its left and the destination at its
 * right, each its ident over the airport's name where the planner has
 * given it -- the names catch a wrong field (KIGN was Indagen) -- the
 * stops between them counted, and a chevron in the tint. One button: a
 * tap opens the route to edit, its airport cards under its head
 * (RouteHead), as an iOS list's Edit does.
 */
export default function RouteSummary({
  dep,
  dest,
  stops,
  depName,
  destName,
  onOpen,
}: {
  dep: string;
  dest: string;
  stops: string[];
  /** The ends' names as the plan has them (placeName), none before it. */
  depName?: string | null;
  destName?: string | null;
  onOpen: () => void;
}) {
  const many = stops.length;
  const via = many ? `, ${many} ${many === 1 ? "stop" : "stops"}: ${stops.map(pointName).join(", ")}` : "";
  const named = (ident: string, name?: string | null) => `${pointName(ident)}${name ? ` ${name}` : ""}`;
  return (
    <BaseButton
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Route, ${named(dep, depName)} to ${named(dest, destName)}${via}. Edit`}
      data-testid="route-summary"
      data-route-toggle=""
      className={cn(
        "grid h-[3.25rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-full pr-3 pl-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        PANEL_FIELD_FILL,
      )}
    >
      <End ident={dep} name={depName}>
        <Mark round />
      </End>
      <span aria-hidden="true" className={cn("flex items-center gap-1 font-semibold text-muted-foreground", TEXT.note)}>
        <ArrowRight className="size-3.5" />
        {many > 0 && (
          <>
            {many === 1 ? "1 stop" : `${many} stops`}
            <ArrowRight className="size-3.5" />
          </>
        )}
      </span>
      <End ident={dest} name={destName} end>
        <Mark />
      </End>
      <ChevronDown aria-hidden="true" className="size-5 text-tint" />
    </BaseButton>
  );
}

function End({ ident, name, end = false, children }: { ident: string; name?: string | null; end?: boolean; children: ReactNode }) {
  return (
    <span aria-hidden="true" className={cn("flex min-w-0 items-center gap-2", end && "justify-end")}>
      {!end && children}
      <span className={cn("flex min-w-0 flex-col leading-tight", end && "items-end")}>
        <span className={cn("max-w-full truncate font-mono font-semibold uppercase", TEXT.row)}>{pointName(ident)}</span>
        {name && <span className={cn("max-w-full truncate text-muted-foreground", TEXT.note)}>{name}</span>}
      </span>
      {end && children}
    </span>
  );
}

/** The departure's mark a circle, the destination's a square, in the
 *  course's magenta. */
function Mark({ round = false }: { round?: boolean }) {
  return <span className={cn("size-3 shrink-0 border-[3px] border-solid", round ? "rounded-full" : "rounded-[3px]")} style={COURSE} />;
}
