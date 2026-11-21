import { useId, useState } from "react";
import { cn } from "cn";
import SheetDialog from "../../components/SheetDialog";
import Segmented from "../../components/Segmented";
import { Button } from "../../components/ui/button";
import { NumberField } from "../../components/ui/number-field";
import { WHOLE } from "../../components/ui/numberFormats";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "../../components/ui/popover";
import { useIsMobile } from "../../hooks/use-mobile";
import { TEXT } from "../../lib/text";
import { FuelGauge } from "./FuelGauge";
import { gaugeWords } from "./gaugeWords";
import type { TankAt } from "./routeTanks";

type Pick = "full" | "none" | "own";

/**
 * A field's fuel gauge on FPL's timeline, tapped to set the fuel in the
 * tanks as the airplane leaves it (the owner, 2026-11-21: "can we set the
 * fuel tank by tapping on it?"). At the departure, the fuel on board at
 * engine start; at a stop, what the tanks are fuelled to there. Quick picks
 * as a segmented control (rules.md: discrete settings are menus or
 * segments) -- Full, the airplane's usable fuel, and at a stop No fuel,
 * which keeps what it lands with -- and the gallons typed in a number
 * field. No Tabs pick: no airplane profile carries a tabs figure, and none
 * is assumed. More than the tanks hold is kept with a warning (warn, never
 * limit); the engine's fuel_in_tanks walks the tanks from it, and the
 * planner's fuel checks fly the same figure (the query's `tanks`). A stock
 * Popover at the gauge from a tablet's width up, on a phone the app's
 * sheet with Cancel and Done (as LegAltitude); Undo is the plan's, in the
 * route's menu and Cmd-Z ("Undo Fuel").
 */
export function FuelSet({
  tank,
  ident,
  stop,
  tone,
  onSet,
}: {
  tank: TankAt;
  ident: string;
  /** A stop's gauge, where the tanks are fuelled; else the departure's. */
  stop: boolean;
  tone?: "fuel" | "low";
  /** Gallons, 0 at a stop for none bought; null back to full. */
  onSet: (gallons: number | null) => void;
}) {
  const phone = useIsMobile();
  const [open, setOpen] = useState(false);
  const usable = Math.floor(tank.usable);
  // What it lands with at a stop, which No fuel keeps.
  const left = Math.max(0, Math.floor(tank.gal));
  const pickOf = (own: number | null): Pick => (own === null ? "full" : stop && own === 0 ? "none" : "own");
  const [pick, setPick] = useState<Pick>(pickOf(tank.own));
  const [typed, setTyped] = useState<number | null>(tank.own);
  // A pick on the segments puts its gallons in the field (drawn again
  // with them); a figure typed only moves the pick to Gallons.
  const [picked, setPicked] = useState(0);
  const form = useId();
  const shown = pick === "full" ? usable : pick === "none" ? left : typed;
  const over = shown !== null && shown > tank.usable;
  // A stop's figure under what the airplane lands with keeps what it lands
  // with: the fuel is not taken out (the engine's tanks_leaving, which
  // fuel_in_tanks and the planner's check fly). Said, not kept silently.
  const kept = stop && pick === "own" && typed !== null && typed < tank.gal;
  const valid = pick !== "own" || (typed !== null && typed >= 0);
  const openWith = (next: boolean) => {
    if (next) {
      setPick(pickOf(tank.own));
      setTyped(tank.own);
    }
    setOpen(next);
  };
  const done = () => {
    if (!valid) return;
    onSet(pick === "full" ? null : pick === "none" ? 0 : Math.round(typed!));
    setOpen(false);
  };
  const words = gaugeWords(tank.gal);
  const title = stop ? `Fuel at ${ident}` : `Fuel on board at ${ident}`;
  const description = stop
    ? `What the tanks hold after fuelling at ${ident}: full, none bought, or the gallons.`
    : "The fuel in the tanks at engine start: full, or the gallons.";
  const options = [
    { value: "full", label: `Full (${usable} gal)` },
    ...(stop ? [{ value: "none", label: "No fuel" }] : []),
    { value: "own", label: "Gallons" },
  ];
  const body = (
    <form
      id={form}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <Segmented
        label="Fuel"
        value={pick}
        onChange={(v) => {
          setPick(v as Pick);
          setPicked((n) => n + 1);
        }}
        options={options}
        testId="fuel-set-pick"
        className="w-full [&>*]:flex-1"
      />
      <NumberField
        key={`${open}-${picked}`}
        defaultValue={shown}
        onTyped={(n) => {
          setTyped(n);
          if (n !== shown) setPick("own");
        }}
        formatOptions={WHOLE}
        minValue={0}
        unit="gal"
        aria-label={`${title}, gallons`}
        className="h-10"
        data-testid="fuel-set-input"
      />
      {/* Warn, never limit: more than the airplane's usable fuel is the
          pilot's word, kept as set. */}
      <p
        className={cn("min-h-5", over ? "text-destructive-ink" : "text-muted-foreground", TEXT.note)}
        aria-live="polite"
        data-testid="fuel-set-note"
      >
        {over
          ? `More than the ${usable} gal the tanks hold`
          : kept
            ? `Keeps the ${gaugeWords(tank.gal)} it lands with`
            : stop
              ? `Lands with ${gaugeWords(tank.gal)}`
              : null}
      </p>
      {!phone && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => openWith(false)} data-testid="fuel-set-cancel">
            Cancel
          </Button>
          <Button type="submit" disabled={!valid} data-testid="fuel-set-done">
            Done
          </Button>
        </div>
      )}
    </form>
  );
  // The gauge is the button: its name carries the gallons in sight
  // (WCAG 2.5.3), its 44-point area a pseudo-element, over the line's own
  // tap that opens the field (z-10, as the ident's).
  const gauge = (
    <Button
      variant="plain"
      size="inline"
      type="button"
      aria-label={stop ? `${words}, fuel at ${ident}: change` : `${words}, fuel on board: change`}
      data-testid={stop ? "fuel-set-stop" : "fuel-set-departure"}
      className="relative z-10 shrink-0 hit-x-1 hit-y-3"
      onClick={phone ? () => openWith(true) : undefined}
    >
      <FuelGauge gal={tank.gal} usable={tank.usable} tone={tone} />
    </Button>
  );
  if (phone)
    return (
      <>
        {gauge}
        <SheetDialog
          open={open}
          onOpenChange={openWith}
          cancel
          size="sm"
          title={title}
          description={description}
          action={{ label: "Done", form, disabled: !valid, testId: "fuel-set-done" }}
          initialFocus={(sheet) => sheet.querySelector("input")}
        >
          {body}
        </SheetDialog>
      </>
    );
  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger render={gauge} />
      <PopoverContent side="bottom" data-testid="fuel-set">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>
        {body}
      </PopoverContent>
    </Popover>
  );
}
