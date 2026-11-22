import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { errorIdOf, invalidProps } from "../../lib/fieldError";
import FieldHit from "../../components/FieldHit";
import { Input } from "../../components/ui/input";
import NumberRow from "./NumberRow";
import SpeedAndBurnGroups from "./SpeedAndBurnGroups";
import type { AircraftFormValues } from "./aircraftForm";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { cruiseReferenceFt } from "../../lib/performance";
import { altFt } from "../../lib/format";

/** What the gateway refused of a field, or nothing, as a row's description. */
// What is wrong with a field, said under its title with the id its field is
// described by, so a reader says the two together (WCAG 3.3.1).
const problem = (id: string, message?: string) =>
  message ? (
    <span id={errorIdOf(id)} className="text-destructive">
      {message}
    </span>
  ) : undefined;

/** The airplane form's fields: what it is, its speeds and burns, its tanks
 *  and its flight plan items, each a row of a grouped list. */
export function AircraftFields({
  formId,
  register,
  control,
  errors,
}: {
  formId: string;
  register: UseFormRegister<AircraftFormValues>;
  control: Control<AircraftFormValues>;
  errors: FieldErrors<AircraftFormValues>;
}) {
  return (
    <>
      {/* What the airplane is, then its speeds and fuel burns --
      climb and cruise, a row each under the group's heading
      -- and the power the cruise is at, then its tanks. Each
      field keeps its label and unit while it is typed in; the
      placeholders are examples. The accessible names say the
      phase and the units in full. The identifiers are
      capitals and never autocorrected. */}
      <ListGroup>
        <ListRow id={`${formId}-tail`} title="Tail number" description={problem(`${formId}-tail`, errors.tailNumber?.message)}>
          <FieldHit htmlFor={`${formId}-tail`}>
            <Input
              id={`${formId}-tail`}
              {...register("tailNumber")}
              placeholder="N12345"
              className="h-8 w-32 text-right"
              aria-label="Tail number"
              {...invalidProps(`${formId}-tail`, errors.tailNumber?.message)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </FieldHit>
        </ListRow>
        <ListRow id={`${formId}-type`} title="Type" description={problem(`${formId}-type`, errors.typeDesignator?.message)}>
          <FieldHit htmlFor={`${formId}-type`}>
            <Input
              id={`${formId}-type`}
              {...register("typeDesignator")}
              placeholder="C172"
              className="h-8 w-32 text-right"
              aria-label="Type designator"
              {...invalidProps(`${formId}-type`, errors.typeDesignator?.message)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </FieldHit>
        </ListRow>
      </ListGroup>
      <SpeedAndBurnGroups formId={formId} control={control} errors={errors} />
      {/* What the cruise figures mean to the planner, said where
      they are typed: they are the airplane's at this power at
      the reference altitude, and each leg flies them in its own
      air (the engine's wingtip_flight::performance): the handbook cruise table's at this
      power at the reference altitude on a standard day, which
      the group's title says. */}
      <ListGroup title={`Cruise figures at ${altFt(cruiseReferenceFt())} ft, standard day`}>
        <NumberRow
          id={`${formId}-power`}
          title="Cruise power"
          unit="%"
          placeholder="65"
          name="Cruise power in percent"
          control={control}
          field="cruisePowerPct"
          error={errors.cruisePowerPct?.message}
        />
      </ListGroup>
      {/* Usable fuel is optional; without it the nav log makes no fuel check. */}
      <ListGroup>
        <NumberRow
          id={`${formId}-usable`}
          title="Usable fuel"
          unit="gal"
          placeholder="40"
          name="Usable fuel in gallons"
          control={control}
          field="usableFuelGal"
          error={errors.usableFuelGal?.message}
        />
      </ListGroup>
      {/* What its flight plan says of it, which the Brief's form
      fills in (FAA Form 7233-4, AIM Appendix 4): item 10a, S for
      VHF radio, VOR and ILS and a letter for each of the rest (G
      for GNSS); 10b, C for a transponder with Mode C, B1 or U1
      for ADS-B Out; item 19's colour and markings. Codes are
      capitals, never autocorrected. */}
      <ListGroup title="Flight plan">
        <ListRow id={`${formId}-equipment`} title="Equipment" description={problem(`${formId}-equipment`, errors.equipment?.message)}>
          <FieldHit htmlFor={`${formId}-equipment`}>
            <Input
              id={`${formId}-equipment`}
              {...register("equipment")}
              placeholder="SDFGRY"
              maxLength={40}
              className="h-8 w-32 text-right font-mono uppercase"
              aria-label="Equipment, flight plan item 10a"
              {...invalidProps(`${formId}-equipment`, errors.equipment?.message)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </FieldHit>
        </ListRow>
        <ListRow
          id={`${formId}-surveillance`}
          title="Surveillance"
          description={problem(`${formId}-surveillance`, errors.surveillance?.message)}
        >
          <FieldHit htmlFor={`${formId}-surveillance`}>
            <Input
              id={`${formId}-surveillance`}
              {...register("surveillance")}
              placeholder="B1"
              maxLength={20}
              className="h-8 w-32 text-right font-mono uppercase"
              aria-label="Surveillance, flight plan item 10b"
              {...invalidProps(`${formId}-surveillance`, errors.surveillance?.message)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </FieldHit>
        </ListRow>
        <ListRow id={`${formId}-colour`} title="Color" description={problem(`${formId}-colour`, errors.colour?.message)}>
          <FieldHit htmlFor={`${formId}-colour`}>
            <Input
              id={`${formId}-colour`}
              {...register("colour")}
              placeholder="White, blue stripe"
              maxLength={40}
              className="h-8 w-40 text-right"
              aria-label="Color and markings, flight plan item 19"
              {...invalidProps(`${formId}-colour`, errors.colour?.message)}
            />
          </FieldHit>
        </ListRow>
      </ListGroup>
    </>
  );
}
