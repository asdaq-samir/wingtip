import { useId, useState } from "react";
import { cn } from "cn";
import SheetDialog from "../../../../../components/SheetDialog";
import Segmented from "../../../../../components/Segmented";
import { Button } from "../../../../../components/ui/button";
import { NumberField } from "../../../../../components/ui/number-field";
import { THREE_FIGURES } from "../../../../../components/ui/numberFormats";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../../../../components/ui/popover";
import { useIsMobile } from "../../../../../hooks/use-mobile";
import { callEngine } from "../../../../../lib/engine/engine";
import { duration, flightLevel, one } from "../../../../../lib/format";
import type { Leg } from "../../../../../lib/api/types";
import { TEXT } from "../../../../../lib/text";

export type ChangeMode = "start_at" | "cross_at";

/** A waypoint on the profile, as its per-leg altitude is set from it. */
export interface ProfilePoint {
  ident: string;
  /** Where it is along the side view, nm, and as a share of its length. */
  along_nm: number;
  share: number;
  /** The leg before the one flown into it, that one, and the one out of
   *  it: where the change is flown from and in. */
  legBefore?: Leg;
  legIn?: Leg;
  legOut?: Leg;
}

const MODES = [
  { value: "start_at", label: "Start At" },
  { value: "cross_at", label: "Cross At" },
];

/** Where a change to `feet` at the point is flown, the engine's
 *  (altitude_change): the airplane's climb, the nav log's three-to-one
 *  descent; with no airplane, no time or fuel and a climb drawn as a step. */
function changeWords(point: ProfilePoint, feet: number, mode: ChangeMode, profile: object | null): string | null {
  // Start At leaves the altitude flown into the waypoint; Cross At the one
  // flown before the leg into it, on which the change is made.
  const from = (mode === "cross_at" ? (point.legBefore ?? point.legIn) : point.legIn)?.altitude_ft ?? point.legOut?.altitude_ft;
  if (from == null || !Number.isFinite(feet)) return null;
  const leg = point.legOut ?? point.legIn;
  const ask = (p: object | null) =>
    callEngine("altitude_change", {
      profile: p as never,
      along_nm: point.along_nm,
      from_ft: from,
      to_ft: feet,
      mode,
      groundspeed_kt: leg?.groundspeed_kt ?? null,
      tas_kt: leg?.tas_kt ?? null,
      fuel_burn_gph: leg?.fuel_burn_gph ?? null,
      oat_c: leg?.oat_c ?? null,
      // The climb's own wind triangle in the leg's wind.
      true_course_deg: leg?.true_course_deg ?? null,
      wind_dir_true_deg: leg?.wind?.wind_dir_true_deg ?? null,
      wind_speed_kt: leg?.wind?.wind_speed_kt ?? null,
    });
  let c;
  try {
    c = ask(profile);
  } catch {
    // An airplane short of a climb figure: the geometry alone.
    c = ask(null);
  }
  if (c.kind === "level") return "Level: no climb or descent here.";
  const where =
    c.begins_nm === c.ends_nm
      ? `at ${point.ident}`
      : mode === "start_at"
        ? `from ${point.ident}, done ${one(c.ends_nm - c.begins_nm)} nm on`
        : `${one(c.ends_nm - c.begins_nm)} nm before ${point.ident}, done by it`;
  const cost = c.minutes != null ? ` · ${duration(c.minutes)}${c.gallons != null ? ` · ${one(c.gallons)} gal` : ""}` : "";
  return `${c.kind === "climb" ? "Climb" : "Descent"} ${where}${cost}`;
}

/**
 * A waypoint's own altitude, set from its mark on the
 * profile (the owner's pick, 2026-11-10, after ForeFlight's): the figure as
 * a flight level, Start At (the climb or descent begins at the waypoint)
 * or Cross At (it is done by the waypoint), and where it is flown, the
 * engine's. A stock Popover at the mark from a tablet's width up, and on a
 * phone a sheet (SheetDialog) with Cancel and Set in its title row.
 */
export default function LegAltitude({
  point,
  profile,
  onSet,
}: {
  point: ProfilePoint;
  /** The airplane picked, as the engine reads it; null for none. */
  profile: object | null;
  onSet: (point: ProfilePoint, feet: number, mode: ChangeMode) => void;
}) {
  const phone = useIsMobile();
  const [open, setOpen] = useState(false);
  const planned = point.legIn?.altitude_ft ?? point.legOut?.altitude_ft ?? null;
  const level = planned === null ? null : Number(flightLevel(planned).slice(3));
  // The flight level as typed (React Aria's NumberField), hundreds of feet.
  const [typed, setTyped] = useState<number | null>(null);
  const [mode, setMode] = useState<ChangeMode>("cross_at");
  const form = useId();
  const feet = typed != null ? typed * 100 : Number.NaN;
  // Under Class A and at least 500 ft (the engine's altitude_allowed;
  // 14 CFR 71.33, 91.135, 91.119(c)), as the address takes one.
  const valid = Number.isFinite(feet) && callEngine("altitude_allowed", { ft: feet });
  const words = valid ? changeWords(point, feet, mode, profile) : null;
  const openWith = (next: boolean) => {
    if (next) setTyped(level);
    setOpen(next);
  };
  const set = () => {
    if (!valid) return;
    onSet(point, feet, mode);
    setOpen(false);
  };
  const title = `Altitude at ${point.ident}`;
  const body = (
    <form
      id={form}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        set();
      }}
    >
      <NumberField
        key={String(open)}
        defaultValue={level}
        onTyped={setTyped}
        formatOptions={THREE_FIGURES}
        minValue={0}
        maxValue={999}
        placeholder="---"
        lead="FL"
        aria-label={`${title}, flight level`}
        className="h-10 font-mono"
        inputClassName="font-mono"
        data-testid="leg-altitude-input"
      />
      <Segmented
        label="Where the change is flown"
        value={mode}
        onChange={(v) => setMode(v as ChangeMode)}
        options={MODES}
        testId="leg-altitude-mode"
        className="w-full [&>*]:flex-1"
      />
      <p className={cn("min-h-5 text-muted-foreground", TEXT.note)} aria-live="polite" data-testid="leg-altitude-change">
        {words}
      </p>
      {!phone && (
        <Button type="submit" disabled={!valid} data-testid="leg-altitude-set">
          Set
        </Button>
      )}
    </form>
  );
  const mark = (
    <button
      type="button"
      aria-label={`${point.ident}: set the altitude at it`}
      data-testid="profile-waypoint"
      className={cn(
        "absolute bottom-6 size-3 -translate-x-1/2 rotate-45 rounded-[2px] border-2 border-background bg-tint shadow-sm outline-none",
        "after:absolute after:-inset-4 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
      )}
      style={{ left: `calc(0.5rem + (100% - 1rem) * ${point.share})` }}
      onClick={phone ? () => openWith(true) : undefined}
    />
  );
  if (phone)
    return (
      <>
        {mark}
        <SheetDialog
          open={open}
          onOpenChange={openWith}
          cancel
          size="sm"
          title={title}
          description="Start At begins the climb or descent at the waypoint; Cross At has it done by the waypoint."
          action={{ label: "Set", form, disabled: !valid, testId: "leg-altitude-set" }}
          initialFocus={(sheet) => sheet.querySelector("input")}
        >
          {body}
        </SheetDialog>
      </>
    );
  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger render={mark} />
      <PopoverContent side="top" data-testid="leg-altitude">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>
            Start At begins the climb or descent at the waypoint; Cross At has it done by the waypoint.
          </PopoverDescription>
        </PopoverHeader>
        {body}
      </PopoverContent>
    </Popover>
  );
}
