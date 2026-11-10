import { useId } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { FormDateField, FormNumberField } from "../../components/FormFields";
import { zodResolver } from "@hookform/resolvers/zod";
import { requiredPastDay, z } from "./formSchema";
import { done } from "../../lib/doneNote";
import FieldHit from "../../components/FieldHit";
import RowField from "../../components/RowField";
import { invalidProps } from "../../lib/fieldError";
import { ariaInvalid } from "../../components/ui/ariaInvalid";
import { cn } from "cn";
import { Input } from "../../components/ui/input";
import PullDown from "../../components/PullDown";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { api } from "../../lib/api/client";
import type { Aircraft, VorCheckRequest } from "../../lib/api/types";
import { localDay } from "../../lib/format";
import { FINDING_TONE } from "../../lib/findings";
import { callEngine } from "../../lib/engine/engine";

/** The ways a VOR is checked for IFR (14 CFR 91.171(b), (c)); the error
 *  each allows is the engine's (`vor_check_limit_deg`). */
const VOR_CHECKS: { value: VorCheckRequest["kind"]; label: string }[] = [
  { value: "VOT", label: "VOT" },
  { value: "REPAIR_STATION", label: "Repair station signal" },
  { value: "GROUND", label: "Ground checkpoint" },
  { value: "AIRBORNE", label: "Airborne checkpoint" },
  { value: "RADIAL", label: "Airway radial in flight" },
  { value: "DUAL", label: "Dual receivers" },
];

// The server's own limits on a VOR check (VorCheckRequest.java): the day
// not ahead, the place at most 80 characters, and an error within 30° --
// a typing slip past that, not a reading; 91.171's own 4° and 6° are
// the check's standing, said once it is recorded, never refused.
const vorCheckSchema = z.object({
  checkedOn: requiredPastDay("The day is required"),
  kind: z.enum(["VOT", "REPAIR_STATION", "GROUND", "AIRBORNE", "RADIAL", "DUAL"]),
  place: z.string().trim().max(80, "At most 80 characters"),
  errorDeg: z
    .string()
    .trim()
    .min(1, "The error is required")
    .refine((value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 30, "Within 30° either way"),
});
type VorCheckValues = z.infer<typeof vorCheckSchema>;

/**
 * The airplane's VOR check for IFR (14 CFR 91.171): the last one and how
 * long it is good for -- 30 days, its error within its kind's limit (4
 * degrees at a VOT, a repair station's signal, a ground checkpoint or
 * between two receivers; 6 at an airborne checkpoint or on a radial) --
 * and the next recorded with the date, kind, place and error 91.171(d)
 * asks for. Its own Record, apart from the airplane's Save.
 */
export function VorCheckGroup({ aircraft }: { aircraft: Aircraft }) {
  const queryClient = useQueryClient();
  const id = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VorCheckValues>({
    resolver: zodResolver(vorCheckSchema),
    defaultValues: { checkedOn: localDay(), kind: "VOT", place: "", errorDeg: "0" },
  });
  const record = useMutation({
    mutationFn: (request: VorCheckRequest) => api.aircraft.vorCheck(aircraft.id, request),
    onSuccess: () => {
      done("VOR Check Saved");
      void queryClient.invalidateQueries({ queryKey: ["aircraft"] });
    },
  });
  // Inside the airplane's own form, so its Record is a button, not a
  // second <form>: handleSubmit checks the fields, then sends them, or
  // focuses the first one wrong.
  const onRecord = handleSubmit((values) =>
    record.mutate({
      checkedOn: values.checkedOn,
      kind: values.kind,
      place: values.place.trim() || null,
      errorDeg: Number(values.errorDeg),
    }),
  );
  const last = aircraft.vorCheck;
  const today = localDay();
  const good = !!last && last.withinLimit && last.goodThrough >= today;
  return (
    // For IFR by VOR: every 30 days, within 4° at a VOT, a repair station's
    // signal, a ground checkpoint or between two receivers, within 6° at an
    // airborne checkpoint or on an airway's radial (14 CFR 91.171).
    <ListGroup title="VOR check">
      <ListRow
        title="Last check"
        description={
          last
            ? `${last.checkedOn} · ${VOR_CHECKS.find((k) => k.value === last.kind)?.label ?? last.kind}${last.place ? ` · ${last.place}` : ""} · ${last.errorDeg}°`
            : "None recorded"
        }
        value={
          !last ? undefined : (
            <span className={cn(good ? FINDING_TONE.ok : FINDING_TONE.stop)} data-testid="vor-check-standing">
              {!last.withinLimit ? `Over ${last.limitDeg}°` : good ? `To ${last.goodThrough}` : `Ended ${last.goodThrough}`}
            </span>
          )
        }
      />
      <ListRow id={`${id}-on`} title="Checked on">
        <RowField id={`${id}-on`} error={errors.checkedOn?.message}>
          <FormDateField
            control={control}
            name="checkedOn"
            id={`${id}-on`}
            className="h-8 w-40"
            max={today}
            {...ariaInvalid(`${id}-on`, errors.checkedOn?.message)}
            aria-label="VOR check date"
            data-testid="vor-check-date"
          />
        </RowField>
      </ListRow>
      <ListRow title="How">
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <PullDown
              label="How the VOR was checked"
              value={field.value}
              testId="vor-check-kind"
              options={VOR_CHECKS.map((k) => ({
                value: k.value,
                label: `${k.label} (±${callEngine("vor_check_limit_deg", { kind: k.value })}°)`,
              }))}
              onChange={field.onChange}
            />
          )}
        />
      </ListRow>
      <ListRow id={`${id}-place`} title="Where">
        <RowField id={`${id}-place`} error={errors.place?.message}>
          <FieldHit htmlFor={`${id}-place`}>
            <Input
              id={`${id}-place`}
              className="h-8 w-40 text-right"
              placeholder="KDLH VOT"
              {...register("place")}
              {...invalidProps(`${id}-place`, errors.place?.message)}
              aria-label="Where the VOR was checked"
            />
          </FieldHit>
        </RowField>
      </ListRow>
      <ListRow id={`${id}-error`} title="Bearing error">
        <RowField id={`${id}-error`} error={errors.errorDeg?.message}>
          <FieldHit htmlFor={`${id}-error`}>
            <FormNumberField
              control={control}
              name="errorDeg"
              id={`${id}-error`}
              className="h-8 w-24"
              inputClassName="text-right"
              {...ariaInvalid(`${id}-error`, errors.errorDeg?.message)}
              aria-label="Bearing error in degrees"
              data-testid="vor-check-error"
            />
          </FieldHit>
        </RowField>
      </ListRow>
      <ListRow
        title={<span className="font-medium text-tint">Record check</span>}
        onClick={() => void onRecord()}
        disabled={record.isPending}
        data-testid="vor-check-record"
      />
    </ListGroup>
  );
}
