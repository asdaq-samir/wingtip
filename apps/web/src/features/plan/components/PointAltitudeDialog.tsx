import { useId, useState } from "react";
import SheetDialog from "../../../components/SheetDialog";
import { useDiscardGuard } from "../../../components/discardGuard";
import { Button } from "../../../components/ui/button";
import { NumberField } from "../../../components/ui/number-field";
import { THREE_FIGURES, WHOLE } from "../../../components/ui/numberFormats";
import { callEngine } from "../../../lib/engine/engine";
import { TEXT } from "../../../lib/text";
import { altFt, flightLevel } from "../../../lib/format";

/** The altitude at a point of the route: the pilot's own (`own`), else
 *  the plan's -- a waypoint's cruise there, an airport's pattern -- in
 *  feet; null before the planner has said. */
export interface PointAltitude {
  feet: number | null;
  own: boolean;
  /** What is wrong with the pilot's own, as the planner checked it against
   *  the band it worked out there (14 CFR 91.119, 91.159, 91.131, 91.155). */
  caution?: string[];
}

/** The point whose altitude is being set, from its menu (RouteBox) or its
 *  row in FPL's list (ProceduresRoute); an airport's elevation where it is
 *  known, the altitude it has without one there. */
export interface EditedPoint {
  ident: string;
  /** What its altitude is kept by in the address: the ident, or at a point
   *  the route is at more than once, its visit's ("VPBNG@2", visitKey). */
  key?: string;
  waypoint: boolean;
  altitude: PointAltitude;
  elevationFt?: number | null;
}

/**
 * A point's own altitude, asked as iOS asks for one figure: an alert with
 * a field in it from `md` up, and on a phone a sheet with Cancel and Set
 * in its title row (SheetDialog). A waypoint's is a cruising altitude,
 * typed as a flight level over its dashes (FL045), as the altitude's chip
 * writes it; it is flown to the waypoint, the rest of the route as
 * planned. An airport's is what a flight landing there comes down to, in
 * feet above sea level -- its traffic pattern's unless the pilot sets one
 * -- its own elevation the altitude it has with none, at the owner's ask
 * ("airports default to field elevation but changeable"). Set, or given
 * back to the plan.
 */
export default function PointAltitudeDialog({
  point,
  onClose,
  onSet,
}: {
  point: EditedPoint | null;
  onClose: () => void;
  onSet: (ident: string, feet: number | null) => void;
}) {
  // Kept as it closes, so its words stay as it slides away; and its own
  // figure for each point opened: what was typed for the last is not
  // this one's.
  const [shown, setShown] = useState(point);
  // As typed (React Aria's NumberField), and the field made new for each
  // point opened.
  const [typed, setTyped] = useState(() => figure(point));
  const [opened, setOpened] = useState(0);
  if (point && point !== shown) {
    setShown(point);
    setTyped(figure(point));
    setOpened((n) => n + 1);
  }
  const form = useId();
  const { ident, waypoint, altitude, elevationFt } = shown ?? {
    ident: "",
    waypoint: false,
    altitude: { feet: null, own: false } as PointAltitude,
  };
  // A waypoint's in hundreds of feet, three figures; an airport's in feet.
  const feet = typed != null ? typed * (waypoint ? 100 : 1) : Number.NaN;
  // Under Class A and at least 500 ft (the engine's altitude_allowed;
  // 14 CFR 71.33, 91.135, 91.119(c)), as the address takes one.
  const valid = Number.isFinite(feet) && callEngine("altitude_allowed", { ft: feet });
  // A figure typed is asked about before it is thrown away (useDiscardGuard).
  const [closing, discard] = useDiscardGuard(!!shown && typed !== figure(shown), onClose);
  return (
    <>
      {discard}
      <SheetDialog
        open={!!point}
        onOpenChange={closing}
        alert
        cancel
        size="sm"
        title={`Altitude at ${ident}`}
        description={
          waypoint
            ? "Flown to it at this altitude; the rest of the route as planned."
            : `${elevationFt != null ? `Field elevation ${altFt(elevationFt)} ft. ` : ""}Where a flight landing here comes down to, in feet above sea level.`
        }
        action={{ label: "Set", form, disabled: !valid, testId: "point-altitude-set" }}
        more={
          altitude.own && (
            <Button type="button" variant="ghost" onClick={() => onSet(ident, null)} data-testid="point-altitude-reset">
              Reset
            </Button>
          )
        }
        // The field focused, for the figure to be typed at once: an alert
        // focuses its Cancel.
        initialFocus={(sheet) => sheet.querySelector("input")}
      >
        <form
          id={form}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSet(ident, feet);
          }}
          className="contents"
        >
          {altitude.caution && altitude.caution.length > 0 && (
            <ul
              className={`list-disc space-y-0.5 rounded-lg bg-caution-wash py-2 pr-2.5 pl-6 text-caution-ink ${TEXT.prose}`}
              data-testid="point-altitude-caution"
            >
              {altitude.caution.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {/* The figure with its unit inside the field. */}
          <NumberField
            key={opened}
            defaultValue={figure(shown)}
            onTyped={setTyped}
            formatOptions={waypoint ? THREE_FIGURES : WHOLE}
            minValue={0}
            maxValue={waypoint ? 999 : 99999}
            placeholder={waypoint ? "---" : "-----"}
            lead={waypoint ? "FL" : undefined}
            unit={waypoint ? undefined : "ft"}
            aria-label={waypoint ? `Altitude at ${ident}, flight level` : `Altitude at ${ident}, feet`}
            className="h-10 font-mono"
            inputClassName="font-mono"
            data-testid="point-altitude-input"
          />
        </form>
      </SheetDialog>
    </>
  );
}

/** The figure a point's altitude is typed as: a waypoint's flight level's
 *  three figures (045), an airport's feet. */
function figure(point: EditedPoint | null): number | null {
  const feet = point?.altitude.feet ?? null;
  if (feet === null) return null;
  return point!.waypoint ? Number(flightLevel(feet).slice(3)) : Math.round(feet);
}
