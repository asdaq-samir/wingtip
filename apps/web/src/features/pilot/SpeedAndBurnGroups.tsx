import type { Control, FieldErrors } from "react-hook-form";
import { ListGroup } from "../../components/GroupedList";
import type { AircraftFormValues } from "./AccountPanels";
import NumberRow from "./NumberRow";

/**
 * The airplane form's speeds and fuel burns, phase by phase: the climb's
 * and the cruise's true airspeeds, the descent's indicated one as its
 * handbook gives it (the engine flies it as a true airspeed at the
 * descent's altitude, FAA-H-8083-25C ch. 8), and each phase's burn. The
 * climb and the descent are optional: left blank, the nav log climbs at
 * the type's book figures and flies the descent on the cruise's, asking
 * for the descent's where it is needed.
 */
export default function SpeedAndBurnGroups({
  formId,
  control,
  errors,
}: {
  formId: string;
  control: Control<AircraftFormValues>;
  errors: FieldErrors<AircraftFormValues>;
}) {
  return (
    <>
      <ListGroup title="True airspeed">
        <NumberRow
          id={`${formId}-climb-tas`}
          title="Climb"
          unit="kt"
          placeholder="74"
          name="Climb TAS in knots"
          control={control}
          field="climbTasKt"
          error={errors.climbTasKt?.message}
        />
        <NumberRow
          id={`${formId}-tas`}
          title="Cruise"
          unit="kt"
          placeholder="110"
          name="Cruise TAS in knots"
          control={control}
          field="cruiseTasKt"
          error={errors.cruiseTasKt?.message}
        />
      </ListGroup>
      <ListGroup title="Indicated airspeed">
        <NumberRow
          id={`${formId}-descent-ias`}
          title="Descent"
          unit="kt"
          placeholder="100"
          name="Descent indicated airspeed in knots"
          control={control}
          field="descentIasKt"
          error={errors.descentIasKt?.message}
        />
      </ListGroup>
      <ListGroup title="Fuel burn">
        <NumberRow
          id={`${formId}-climb-burn`}
          title="Climb"
          unit="gph"
          placeholder="11"
          name="Climb fuel burn in gallons per hour"
          control={control}
          field="climbFuelBurnGph"
          error={errors.climbFuelBurnGph?.message}
        />
        <NumberRow
          id={`${formId}-burn`}
          title="Cruise"
          unit="gph"
          placeholder="8.5"
          name="Cruise fuel burn in gallons per hour"
          control={control}
          field="fuelBurnGph"
          error={errors.fuelBurnGph?.message}
        />
        <NumberRow
          id={`${formId}-descent-burn`}
          title="Descent"
          unit="gph"
          placeholder="6"
          name="Descent fuel burn in gallons per hour"
          control={control}
          field="descentFuelBurnGph"
          error={errors.descentFuelBurnGph?.message}
        />
      </ListGroup>
    </>
  );
}
