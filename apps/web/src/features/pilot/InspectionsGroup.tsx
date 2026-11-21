import { useId } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormDateField, FormNumberField } from "../../components/FormFields";
import { zodResolver } from "@hookform/resolvers/zod";
import { numberOrNull, optionalHours, pastDay, textOrNull, z } from "./formSchema";
import { done } from "../../lib/doneNote";
import FieldHit from "../../components/FieldHit";
import RowField from "../../components/RowField";
import { ariaInvalid } from "../../components/ui/ariaInvalid";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { api } from "../../lib/api/client";
import type { Aircraft, InspectionsRequest } from "../../lib/api/types";
import { localDay } from "../../lib/format";
import { FINDING_TONE } from "../../lib/findings";
import SwitchRow from "../../components/SwitchRow";
import { daysBetween, daysWords, dueFinding, kebab } from "./paperwork";

/** The inspections' dates, each with the rule that asks for it. */
const DATED: {
  key: "annualOn" | "staticCheckOn" | "transponderCheckOn" | "eltInspectedOn";
  through: "annualGoodThrough" | "staticCheckGoodThrough" | "transponderCheckGoodThrough" | "eltInspectionGoodThrough";
  title: string;
  rule: string;
}[] = [
  { key: "annualOn", through: "annualGoodThrough", title: "Annual", rule: "12 calendar months, 14 CFR 91.409(a)" },
  { key: "staticCheckOn", through: "staticCheckGoodThrough", title: "Altimeter and static", rule: "24 calendar months, for IFR, 91.411" },
  { key: "transponderCheckOn", through: "transponderCheckGoodThrough", title: "Transponder", rule: "24 calendar months, 91.413" },
  { key: "eltInspectedOn", through: "eltInspectionGoodThrough", title: "ELT inspection", rule: "12 calendar months, 91.207(d)" },
];

// As the server checks them (InspectionsRequest.java): each may be left
// blank; the days done not ahead of today, and the hours not negative.
// The ELT battery's day is the one marked on it (91.207(c)), so may be.
const inspectionsSchema = z.object({
  annualOn: pastDay,
  staticCheckOn: pastDay,
  transponderCheckOn: pastDay,
  eltInspectedOn: pastDay,
  eltBatteryDueOn: z.string(),
  hundredHourAtHours: optionalHours,
  hoursNow: optionalHours,
  forHire: z.boolean(),
});
type InspectionsValues = z.infer<typeof inspectionsSchema>;

/** How a last good day stands today: in green to it, red past it, and the
 *  days left to it -- amber within the reminders' 30 (features/pilot/paperwork). */
function Standing({ through, testId }: { through: string | null | undefined; testId: string }) {
  if (!through) return null;
  const today = localDay();
  const good = through >= today;
  const days = daysBetween(today, through);
  return (
    <>
      <span className={cn(good ? FINDING_TONE.ok : FINDING_TONE.stop)} data-testid={testId}>
        {good ? `To ${through}` : `Past due since ${through}`}
      </span>
      {good && (
        <span className={FINDING_TONE[dueFinding({ daysLeft: days, hoursLeft: null })]} data-testid={`${testId}-days`}>
          {" "}
          · {daysWords(days)}
        </span>
      )}
    </>
  );
}

/**
 * The airplane's inspections and tests, as its owner records them from its
 * maintenance records, each with the last day it is good for (the gateway
 * works it out by the rule's calendar months) -- what the risk assessment
 * reads for whether it may be flown (lib/airworthiness). Saved together.
 */
export function InspectionsGroup({ aircraft }: { aircraft: Aircraft }) {
  const queryClient = useQueryClient();
  const id = useId();
  const recorded = aircraft.inspections;
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InspectionsValues>({
    resolver: zodResolver(inspectionsSchema),
    defaultValues: {
      annualOn: recorded?.annualOn ?? "",
      staticCheckOn: recorded?.staticCheckOn ?? "",
      transponderCheckOn: recorded?.transponderCheckOn ?? "",
      eltInspectedOn: recorded?.eltInspectedOn ?? "",
      eltBatteryDueOn: recorded?.eltBatteryDueOn ?? "",
      hundredHourAtHours: recorded?.hundredHourAtHours == null ? "" : String(recorded.hundredHourAtHours),
      hoursNow: recorded?.hoursNow == null ? "" : String(recorded.hoursNow),
      forHire: !!recorded?.forHire,
    },
  });
  const forHire = useWatch({ control, name: "forHire" });
  const save = useMutation({
    mutationFn: (request: InspectionsRequest) => api.aircraft.inspections(aircraft.id, request),
    onSuccess: () => {
      done("Inspections Saved");
      void queryClient.invalidateQueries({ queryKey: ["aircraft"] });
      void queryClient.invalidateQueries({ queryKey: ["paperwork"] });
    },
  });
  // A button inside the airplane's form, as the VOR check's Record is.
  const onSave = handleSubmit((values) =>
    save.mutate({
      annualOn: textOrNull(values.annualOn),
      staticCheckOn: textOrNull(values.staticCheckOn),
      transponderCheckOn: textOrNull(values.transponderCheckOn),
      eltInspectedOn: textOrNull(values.eltInspectedOn),
      eltBatteryDueOn: textOrNull(values.eltBatteryDueOn),
      hundredHourAtHours: numberOrNull(values.hundredHourAtHours),
      hoursNow: numberOrNull(values.hoursNow),
      forHire: values.forHire,
    }),
  );
  const today = localDay();
  const due = recorded?.hundredHourDueAtHours;
  return (
    // From the airplane's maintenance records. The 100-hour is owed only when
    // it is flown for hire, or for instruction in it by the one who provides
    // it (91.409(b)); the ELT's are not owed on a training flight within 50
    // nm of its departure (91.207(f)).
    <ListGroup title="Inspections">
      {DATED.map((d) => (
        <ListRow
          key={d.key}
          id={`${id}-${d.key}`}
          title={d.title}
          description={
            <>
              {d.rule}
              {recorded?.[d.through] && (
                <>
                  {" "}
                  · <Standing through={recorded[d.through]} testId={`inspection-${kebab(d.key)}`} />
                </>
              )}
            </>
          }
        >
          <RowField id={`${id}-${d.key}`} error={errors[d.key]?.message}>
            <FormDateField
              control={control}
              name={d.key}
              id={`${id}-${d.key}`}
              aria-label={d.title}
              className="h-8 w-40"
              max={today}
              {...ariaInvalid(`${id}-${d.key}`, errors[d.key]?.message)}
              data-testid={`inspection-${kebab(d.key)}-date`}
            />
          </RowField>
        </ListRow>
      ))}
      <ListRow
        id={`${id}-battery`}
        title="ELT battery replace by"
        description={
          <>
            As marked on the transmitter, 91.207(c)
            {recorded?.eltBatteryDueOn && (
              <>
                {" "}
                ·{" "}
                <span
                  className={cn(recorded.eltBatteryDueOn > today ? FINDING_TONE.ok : FINDING_TONE.stop)}
                  data-testid="inspection-elt-battery"
                >
                  {recorded.eltBatteryDueOn > today ? `By ${recorded.eltBatteryDueOn}` : `Due since ${recorded.eltBatteryDueOn}`}
                </span>
              </>
            )}
          </>
        }
      >
        <FormDateField
          control={control}
          name="eltBatteryDueOn"
          id={`${id}-battery`}
          aria-label="ELT battery replace by"
          className="h-8 w-40"
        />
      </ListRow>
      {/* Whether the 100-hour is owed at all: carrying anyone for hire, or
          flight instruction for hire in an airplane the instructor
          provides (91.409(b)). Only then is it listed and reminded of. */}
      {/* The stock switch, its row's title its name: a "Yes" or "No" pill
          was read "Yes, pressed", the question not said (WCAG 1.3.1, 4.1.2). */}
      <Controller
        control={control}
        name="forHire"
        render={({ field }) => (
          <SwitchRow
            title="Flown for hire"
            description="Hire or instruction for hire: the 100-hour, 91.409(b)"
            on={field.value}
            onChange={field.onChange}
            testId="inspection-for-hire"
          />
        )}
      />
      <ListRow
        id={`${id}-at`}
        title="Hours at last 100-hour"
        description={
          !forHire ? (
            "Time in service, at the last annual or 100-hour"
          ) : due != null ? (
            <>
              Due at {due.toFixed(1)} h
              {recorded?.hoursNow != null && (
                <span className={cn(recorded.hoursNow < due ? FINDING_TONE.ok : FINDING_TONE.stop)} data-testid="inspection-hundred-hour">
                  {recorded.hoursNow < due ? `, ${(due - recorded.hoursNow).toFixed(1)} h to go` : ", due now"}
                </span>
              )}
            </>
          ) : (
            "Time in service, at the last annual or 100-hour"
          )
        }
      >
        <RowField id={`${id}-at`} error={errors.hundredHourAtHours?.message}>
          <FieldHit htmlFor={`${id}-at`}>
            <FormNumberField
              control={control}
              name="hundredHourAtHours"
              id={`${id}-at`}
              minValue={0}
              className="h-8 w-28"
              inputClassName="text-right"
              {...ariaInvalid(`${id}-at`, errors.hundredHourAtHours?.message)}
            />
          </FieldHit>
        </RowField>
      </ListRow>
      <ListRow id={`${id}-now`} title="Hours now">
        <RowField id={`${id}-now`} error={errors.hoursNow?.message}>
          <FieldHit htmlFor={`${id}-now`}>
            <FormNumberField
              control={control}
              name="hoursNow"
              id={`${id}-now`}
              minValue={0}
              className="h-8 w-28"
              inputClassName="text-right"
              {...ariaInvalid(`${id}-now`, errors.hoursNow?.message)}
              data-testid="inspection-hours-now"
            />
          </FieldHit>
        </RowField>
      </ListRow>
      <ListRow
        title={<span className="font-medium text-tint">Save inspections</span>}
        onClick={() => void onSave()}
        disabled={save.isPending}
        data-testid="inspections-save"
      />
    </ListGroup>
  );
}
