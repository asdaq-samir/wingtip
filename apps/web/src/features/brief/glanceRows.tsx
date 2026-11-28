import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListRow } from "../../components/GroupedList";
import FindingIcon from "../../components/FindingIcon";
import { clockIn, duration, grouped } from "../../lib/format";
import { airportQuery } from "../../lib/queryClient";
import { FINDING_TONE, type Finding } from "../../lib/findings";
import { mhzText } from "../../lib/frequencies";
import { POSITION_NAME, isPosition } from "../../lib/identSchema";
import { TEXT } from "../../lib/text";
import { ReadyTodo } from "../readyToFly";
import type { PanelTab } from "../plan";
import CategoryBadge from "./CategoryBadge";
import type { BriefGlance, FieldGlance } from "./glance";

const DASH = "—";
/** Whom a frequency is for, in a word over it: a call on the field's CTAF
 *  as the engine marks it (radio_script), where the name's "traffic" was
 *  read for it here; else the station's last word, "Duluth ATIS" its ATIS. */
const radioLabel = (radio: { to: string; ctaf: boolean }) => (radio.ctaf ? "CTAF" : (radio.to.split(" ").at(-1) ?? radio.to));
/** A clock time with its zone, "04:17 CST", as the nav log heads its ETAs:
 *  a bare "04:17" on the Depart row read as Z or local (WEB-9). In the
 *  field's own zone (the planner's `time_zone`), as FPL's timeline gives
 *  each point's: Denver's arrival "19:59 MST" there read "19:59 CST" here,
 *  the same digits an hour apart; this
 *  device's zone until the field's card is in. */
function time(iso: string | null, timeZone: string | null | undefined) {
  const there = iso ? clockIn(new Date(iso), timeZone) : null;
  return there ? `${there.time} ${there.zone}` : undefined;
}

/** The route's strongest headwind in a few words: "18 kt", "None" where
 *  it is a tailwind all the way, a dash before the legs are in. */
const headwindText = (headwind: BriefGlance["enroute"]["headwind"] | undefined) =>
  headwind == null ? DASH : Math.round(headwind.kt) > 0 ? `${Math.round(headwind.kt)} kt` : "None";

/** One figure of a row: its name over it, the figure at a glance's size,
 *  in the foreground over the row's grey line. */
function Stat({ label, value, finding }: { label: string; value: ReactNode; finding?: Finding }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className={cn("break-words text-muted-foreground", TEXT.note)}>{label}</span>
      <span
        className={cn(
          "font-semibold break-words text-foreground tabular-nums",
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
 *  alone, the verdict the one wash. Its
 *  value (`at`: a time, what is left to do) at the line's end, in the
 *  title rather than the row's value, so the figures under it have the
 *  row's whole width, as the mockup's En Route has (option A). */
function Title({
  label,
  ident,
  category,
  finding,
  at,
}: {
  label: string;
  ident?: string;
  category?: string | null;
  finding: Finding;
  at?: ReactNode;
}) {
  return (
    <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {/* The name its own element, apart from the count or time at the
          line's end: it is read, styled and found as the row's name alone. */}
      <span>{label}</span>
      {ident && <strong>{ident}</strong>}
      <CategoryBadge category={category} />
      {(finding === "stop" || finding === "caution") && <FindingIcon finding={finding} className="size-4" />}
      {at && <span className="ml-auto text-muted-foreground tabular-nums">{at}</span>}
    </span>
  );
}

type Open = (tab: PanelTab, section?: string) => void;

/** Before You Go: what is left to do on this device (Ready to Fly's
 *  count, the engine's), and with an airplane its fuel beyond the reserve and its
 *  loading. With none they are not shown at all, not a dash: both are an
 *  airplane's figures (the owner, 2026-11-09). Opens Preflight. */
export function BeforeRow({ before, airplane, onOpen }: { before?: BriefGlance["before"]; airplane: boolean; onOpen: Open }) {
  return (
    <ListRow
      title={<Title label="Before You Go" finding={before?.finding ?? "pending"} at={<ReadyTodo />} />}
      wide
      description={
        airplane && (
          <Figures note={before?.balance?.problem ?? undefined}>
            {/* The fuel over what the flight needs and its reserve (14 CFR
                91.151(a), 91.167(a): enough fuel to fly to the destination
                and on for the reserve), named for the reserve it is beyond:
                "Fuel spare" was no pilot's term. */}
            <Stat
              label="Beyond Reserve"
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
  const timeZone = useQuery({ ...airportQuery(field.ident), enabled: !here }).data?.time_zone;
  const note =
    [field.runwayFt != null && `${grouped(field.runwayFt)} ft long`, field.wind && `wind ${field.wind}`].filter(Boolean).join(" · ") ||
    undefined;
  return (
    <ListRow
      title={
        <Title
          label={label}
          ident={here ? POSITION_NAME : field.ident}
          category={field.category}
          finding={field.finding}
          at={time(field.at, timeZone)}
        />
      }
      wide
      description={
        // The figures it has, no dashes for those it has not (no airplane, no runway picked).
        !here && (field.runway || field.overFiftyFt != null || field.radio || note) ? (
          <Figures note={note}>
            {field.runway && <Stat label="Runway" value={field.runway} />}
            {field.overFiftyFt != null && (
              <Stat
                label={landing ? "Landing 50 ft" : "Takeoff 50 ft"}
                value={`${grouped(field.overFiftyFt)} ft`}
                finding={field.finding === "stop" ? "stop" : undefined}
              />
            )}
            {field.radio && <Stat label={radioLabel(field.radio)} value={mhzText(field.radio.mhz)} />}
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
 *  and the strongest headwind, and its finding in a line where no line over the
 *  list says it already. */
export function EnrouteRow({ enroute, said, onOpen }: { enroute?: BriefGlance["enroute"]; said: boolean; onOpen: Open }) {
  const stop = enroute?.finding === "stop";
  // "None", no ceiling, only where the forecast along the route was read and
  // gave none (its visibility is in): with no forecast yet, or none to read,
  // it is a dash, as the visibility is -- "None" there read as clear skies
  // nothing had said.
  const ceiling = enroute?.ceilingFt != null ? `${grouped(enroute.ceilingFt)} ft` : enroute?.visibilitySm != null ? "None" : DASH;
  return (
    <ListRow
      title={
        <Title
          label="En Route"
          finding={enroute?.finding ?? "pending"}
          at={enroute?.eteMin != null ? duration(enroute.eteMin) : undefined}
        />
      }
      wide
      description={
        <Figures note={said ? undefined : (enroute?.line ?? undefined)}>
          {/* The lowest ceiling any TAF near the route forecasts over the
              flight, not a ceiling now: named so (finding 12). */}
          <Stat label="Lowest Ceiling" value={ceiling} finding={stop && enroute.ceilingFt != null ? "stop" : undefined} />
          <Stat
            label="Visibility"
            value={enroute?.visibilitySm != null ? `${enroute.visibilitySm} sm` : DASH}
            finding={stop && enroute.visibilitySm != null ? "stop" : undefined}
          />
          {/* The route's strongest headwind, the engine's route_headwind
              over every leg, where the first stretch's wind said nothing of
              a later leg flown into a strong one (finding 11); "None" with
              tailwinds all the way. */}
          <Stat label="Most Headwind" value={headwindText(enroute?.headwind)} />
        </Figures>
      }
      chevron
      onClick={() => onOpen("enroute")}
      data-testid="brief-glance-enroute"
      data-finding={enroute?.finding ?? "pending"}
    />
  );
}
