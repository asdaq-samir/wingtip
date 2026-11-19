import type { ReactNode } from "react";
import { cn } from "cn";
import { ListRow } from "../../components/GroupedList";
import FindingIcon from "../../components/FindingIcon";
import { clockTime, duration, grouped, zoneName } from "../../lib/format";
import { FINDING_TONE, type Finding } from "../../lib/findings";
import { mhzText } from "../../lib/frequencies";
import { POSITION_NAME, isPosition } from "../../lib/identSchema";
import { TEXT } from "../../lib/text";
import { ReadyTodo } from "../readyToFly";
import type { PanelTab } from "../plan";
import CategoryBadge from "./CategoryBadge";
import type { BriefGlance, FieldGlance } from "./glance";

const DASH = "—";
/** Whom a frequency is for, in a word over it: "Campbell traffic" is the
 *  field's CTAF, "Duluth ATIS" its ATIS. */
const radioLabel = (to: string) => (/traffic$/i.test(to) ? "CTAF" : (to.split(" ").at(-1) ?? to));
/** A clock time with its zone, "04:17 CST", as the nav log heads its ETAs:
 *  a bare "04:17" on the Depart row read as Z or local (WEB-9). */
const time = (iso: string | null) => (iso ? `${clockTime(new Date(iso))} ${zoneName(new Date(iso))}` : undefined);

/** One figure of a row: its name over it, the figure at a glance's size,
 *  in the foreground over the row's grey line. */
function Stat({ label, value, finding }: { label: string; value: ReactNode; finding?: Finding }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className={cn("truncate text-muted-foreground", TEXT.note)}>{label}</span>
      <span
        className={cn(
          "truncate font-semibold text-foreground tabular-nums",
          TEXT.heading,
          finding && finding !== "ok" && FINDING_TONE[finding],
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** A row's figures, three to a line as En Route's are, and a line of note under them. */
function Figures({ children, note }: { children?: ReactNode; note?: ReactNode }) {
  return (
    <>
      {children && <span className="mt-1 grid grid-cols-3 gap-2 empty:hidden">{children}</span>}
      {note && <span className="mt-1 block">{note}</span>}
    </>
  );
}

/** A part's name and the field it is at, bold, with the field's category
 *  and the part's mark where it has something to fix or look at: the row
 *  itself plain, its red or amber in the mark and the figures that make it
 *  alone, the verdict the one wash (the design review, 2026-10-28). */
function Title({ label, ident, category, finding }: { label: string; ident?: string; category?: string | null; finding: Finding }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {label}
      {ident && <strong>{ident}</strong>}
      <CategoryBadge category={category} />
      {(finding === "stop" || finding === "caution") && <FindingIcon finding={finding} className="size-4" />}
    </span>
  );
}

type Open = (tab: PanelTab, section?: string) => void;

/** Before You Go: what is left to do on this device (Ready to Fly's
 *  count, the engine's), and with an airplane its fuel to spare and its
 *  loading. With none they are not shown at all, not a dash: both are an
 *  airplane's figures (the owner, 2026-11-09). Opens Preflight. */
export function BeforeRow({ before, airplane, onOpen }: { before?: BriefGlance["before"]; airplane: boolean; onOpen: Open }) {
  return (
    <ListRow
      title={<Title label="Before You Go" finding={before?.finding ?? "pending"} />}
      value={<ReadyTodo />}
      description={
        airplane && (
          <Figures note={before?.balance?.problem ?? undefined}>
            <Stat
              label="Fuel spare"
              value={before?.spareGal != null ? `${before.spareGal.toFixed(1)} gal` : DASH}
              finding={before?.spareGal != null && before.spareGal < 0 ? "stop" : undefined}
            />
            <Stat
              label="W&B"
              value={before?.balance ? (before.balance.within ? "Within" : "Outside") : DASH}
              finding={before?.balance && !before.balance.within ? "stop" : undefined}
            />
          </Figures>
        )
      }
      chevron
      onClick={() => onOpen("preflight")}
      data-testid="brief-glance-preflight"
      data-finding={before?.finding ?? "pending"}
    />
  );
}

/** A field's row: its time, then its runway, the distance over 50 ft and
 *  its first frequency, the runway's length and the wind under. From
 *  where the airplane is (POS0) none of them, nor coordinates for a name. */
export function FieldRow({
  tab,
  label,
  field,
  landing,
  onOpen,
}: {
  tab: "depart" | "arrive";
  label: string;
  field: FieldGlance;
  landing: boolean;
  onOpen: Open;
}) {
  const here = isPosition(field.ident);
  const note =
    [field.runwayFt != null && `Of ${grouped(field.runwayFt)} ft`, field.wind && `wind ${field.wind}`].filter(Boolean).join(" · ") ||
    undefined;
  return (
    <ListRow
      title={<Title label={label} ident={here ? POSITION_NAME : field.ident} category={field.category} finding={field.finding} />}
      value={time(field.at)}
      description={
        // The figures it has, no dashes for those it has not (no airplane, no runway picked).
        !here && (field.runway || field.overFiftyFt != null || field.radio || note) ? (
          <Figures note={note}>
            {field.runway && <Stat label="Runway" value={field.runway} />}
            {field.overFiftyFt != null && (
              <Stat
                label={landing ? "Landing 50 ft" : "Takeoff 50 ft"}
                value={grouped(field.overFiftyFt)}
                finding={field.finding === "stop" ? "stop" : undefined}
              />
            )}
            {field.radio && <Stat label={radioLabel(field.radio.to)} value={mhzText(field.radio.mhz)} />}
          </Figures>
        ) : undefined
      }
      chevron
      onClick={() => onOpen(tab)}
      data-testid={`brief-glance-${tab}`}
      data-finding={field.finding}
    />
  );
}

/** En Route: its time, then the lowest ceiling and visibility forecast
 *  and the wind aloft, and its finding in a line where no line over the
 *  list says it already. */
export function EnrouteRow({ enroute, said, onOpen }: { enroute?: BriefGlance["enroute"]; said: boolean; onOpen: Open }) {
  const stop = enroute?.finding === "stop";
  return (
    <ListRow
      title={<Title label="En Route" finding={enroute?.finding ?? "pending"} />}
      value={enroute?.eteMin != null ? duration(enroute.eteMin) : undefined}
      description={
        <Figures note={said ? undefined : (enroute?.line ?? undefined)}>
          <Stat
            label="Ceiling"
            value={enroute?.ceilingFt != null ? `${grouped(enroute.ceilingFt)} ft` : "None"}
            finding={stop && enroute.ceilingFt != null ? "stop" : undefined}
          />
          <Stat
            label="Visibility"
            value={enroute?.visibilitySm != null ? `${enroute.visibilitySm} sm` : DASH}
            finding={stop && enroute.visibilitySm != null ? "stop" : undefined}
          />
          <Stat label="Wind Aloft" value={enroute?.wind ?? DASH} />
        </Figures>
      }
      chevron
      onClick={() => onOpen("enroute")}
      data-testid="brief-glance-enroute"
      data-finding={enroute?.finding ?? "pending"}
    />
  );
}
