import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormDateField, FormNumberField } from "../../components/FormFields";
import { zodResolver } from "@hookform/resolvers/zod";
import { numberOrNull, optionalHours, pastDay, textOrNull, z } from "./formSchema";
import { done } from "../../lib/doneNote";
import { Info, Plus } from "lucide-react";
import FieldHit from "../../components/FieldHit";
import RowField from "../../components/RowField";
import { ariaInvalid } from "../../components/ui/ariaInvalid";
import IconButton from "../../components/IconButton";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import NumberRow from "./NumberRow";
import SpeedAndBurnGroups from "./SpeedAndBurnGroups";
import { useAirplanes } from "./airplanes/useAirplanes";
import { Spinner } from "../../components/ui/spinner";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../components/ResponsivePopover";
import { useConfirm } from "../../components/useConfirm";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import ChecklistPage from "../../components/ChecklistPage";
import SquawksPage from "./SquawksPage";
import { aircraftKey, choiceOf } from "../../lib/aircraftChoice";
import { api } from "../../lib/api/client";
import type { Aircraft, AircraftRequest, InspectionsRequest } from "../../lib/api/types";
import { cruiseReferenceFt } from "../../lib/performance";
import { usePreferences } from "../../lib/preferences";
import { TEXT } from "../../lib/text";
import { altFt, localDay } from "../../lib/format";
import { FINDING_TONE } from "../../lib/findings";
import { aircraftProfilesQuery } from "../../lib/queryClient";
import TogglePill from "../../components/TogglePill";
import { daysBetween, daysWords, dueFinding, kebab } from "./paperwork";
import { callEngine } from "../../lib/engine/engine";
import DueItemsGroup from "./DueItemsGroup";
import { VorCheckGroup } from "./VorCheckGroup";
import { FieldError } from "../../components/ui/field";

/** A form field as the request carries it: blank is null. */
const orNull = (value: string) => (value.trim() ? Number(value) : null);

const AIRCRAFT_FIELDS = [
  "tailNumber",
  "typeDesignator",
  "cruiseTasKt",
  "fuelBurnGph",
  "cruisePowerPct",
  "climbTasKt",
  "climbFuelBurnGph",
  "descentIasKt",
  "descentFuelBurnGph",
  "usableFuelGal",
  "equipment",
  "surveillance",
  "colour",
] as const;

// The fields stay strings through validation (what a plain <input> holds),
// each checked by the engine's aircraft_problems -- the gateway's own
// AircraftRequest limits, the same on every app -- so a bad value is caught
// before the round trip, its words under its field. The numbers are made
// once, building the request body in onSubmit below.
const aircraftSchema = z
  .object(Object.fromEntries(AIRCRAFT_FIELDS.map((f) => [f, z.string()])) as Record<(typeof AIRCRAFT_FIELDS)[number], z.ZodString>)
  .superRefine((form, ctx) => {
    const problems = callEngine("aircraft_problems", form);
    for (const field of AIRCRAFT_FIELDS) {
      const message = problems[field];
      if (message) ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
export type AircraftFormValues = z.infer<typeof aircraftSchema>;
const EMPTY_AIRCRAFT_FORM: AircraftFormValues = {
  tailNumber: "",
  typeDesignator: "",
  cruiseTasKt: "",
  fuelBurnGph: "",
  cruisePowerPct: "",
  climbTasKt: "",
  climbFuelBurnGph: "",
  descentIasKt: "",
  descentFuelBurnGph: "",
  usableFuelGal: "",
  equipment: "",
  surveillance: "",
  colour: "",
};
const typed = (v: number | null | undefined) => (v == null ? "" : String(v));
/** An airplane's figures in the form's fields: one saved, or one sent and
 *  refused. */
function formOf(a: AircraftRequest): AircraftFormValues {
  return {
    tailNumber: a.tailNumber,
    typeDesignator: a.typeDesignator,
    cruiseTasKt: typed(a.cruiseTasKt),
    fuelBurnGph: typed(a.fuelBurnGph),
    cruisePowerPct: typed(a.cruisePowerPct),
    climbTasKt: typed(a.climbTasKt),
    climbFuelBurnGph: typed(a.climbFuelBurnGph),
    descentIasKt: typed(a.descentIasKt),
    descentFuelBurnGph: typed(a.descentFuelBurnGph),
    usableFuelGal: typed(a.usableFuelGal),
    equipment: a.equipment ?? "",
    surveillance: a.surveillance ?? "",
    colour: a.colour ?? "",
  };
}

/** A signed-in pilot's own airplanes -- the one the nav log flies
 *  ticked, and a tap on another flies that one, as iOS lists Wi-Fi
 *  networks; the ⓘ at a row's end opens its figures to edit (the same
 *  form as a new one's), and delete. The picker under the route offers
 *  the same choice. The Library's (PilotPanel), shown only to someone
 *  signed in: it says once, for all three, what signing in keeps. */
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
function InspectionsGroup({ aircraft }: { aircraft: Aircraft }) {
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
          data-testid="inspection-elt-battery-date"
        />
      </ListRow>
      {/* Whether the 100-hour is owed at all: carrying anyone for hire, or
          flight instruction for hire in an airplane the instructor
          provides (91.409(b)). Only then is it listed and reminded of. */}
      <ListRow title="Flown for hire" description="Hire or instruction for hire: the 100-hour, 91.409(b)">
        <Controller
          control={control}
          name="forHire"
          render={({ field }) => (
            <TogglePill
              pressed={field.value}
              onPressedChange={field.onChange}
              label={field.value ? "Yes" : "No"}
              testId="inspection-for-hire"
            />
          )}
        />
      </ListRow>
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
              data-testid="inspection-hundred-hour-at"
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

export function AircraftPanel() {
  // Which the nav log flies, remembered per browser, and the stock
  // profiles a pilot's own rides on (PlanWorkspace asks the same).
  const flying = usePreferences((s) => s.aircraft);
  const fly = usePreferences((s) => s.setAircraft);
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The form is behind the list's New aircraft row: open for a new
  // airplane from there, or for one of the rows from its ⓘ. Closed
  // again when the save lands, on Cancel, or from the same row.
  const [adding, setAdding] = useState(false);
  const formOpen = adding || editingId !== null;
  const formId = useId();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AircraftFormValues>({ resolver: zodResolver(aircraftSchema), defaultValues: EMPTY_AIRCRAFT_FORM });

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    reset(EMPTY_AIRCRAFT_FORM);
  };

  // A save or a delete shows in the list at once, the form closed
  // (useAirplanes); a refused save opens the form again on what was typed,
  // with why at its top, where the pilot was.
  const { list, isLoading, saving, save, remove } = useAirplanes(({ id, request }, why) => {
    if (id) setEditingId(id);
    else setAdding(true);
    reset(formOf(request));
    setError("root.server", { type: "server", message: why });
  });

  const edit = (a: Aircraft) => {
    // One the gateway has yet to give an id is not edited until it has.
    if (a.id < 0) return;
    setEditingId(a.id);
    reset(formOf(a));
  };

  const onSubmit = (values: AircraftFormValues) => {
    const id = editingId;
    cancelEdit();
    save({
      id,
      request: {
        tailNumber: values.tailNumber.trim(),
        typeDesignator: values.typeDesignator.trim(),
        cruiseTasKt: Number(values.cruiseTasKt),
        fuelBurnGph: Number(values.fuelBurnGph),
        cruisePowerPct: orNull(values.cruisePowerPct),
        climbTasKt: orNull(values.climbTasKt),
        climbFuelBurnGph: orNull(values.climbFuelBurnGph),
        descentIasKt: orNull(values.descentIasKt),
        descentFuelBurnGph: orNull(values.descentFuelBurnGph),
        usableFuelGal: orNull(values.usableFuelGal),
        equipment: values.equipment.trim() || null,
        surveillance: values.surveillance.trim() || null,
        colour: values.colour.trim() || null,
        figures: null, // its own figures as they are: the airplane's profile sets them (features/airplane)
      },
    });
  };

  // Delete is in the airplane's own form, asked first: it was a red
  // word on every row, beside Edit.
  const editing = list?.find((a) => a.id === editingId) ?? null;
  const [askDelete, deleteDialog] = useConfirm({
    title: `Delete ${editing?.tailNumber ?? "this airplane"}?`,
    description: "It goes from your airplanes and from the nav log's picker. This can't be undone.",
    confirmLabel: "Delete airplane",
    destructive: true,
    onConfirm: () => {
      if (editingId === null) return;
      const id = editingId;
      cancelEdit();
      remove(id);
    },
  });
  const formElementId = `${formId}-form`;
  const problem = (message?: string) => (message ? <span className="text-destructive">{message}</span> : undefined);

  // The airplane's checklist, a page of the form's (ChecklistPage).
  const checklistPages = editing
    ? {
        [`checklist-${editing.id}`]: {
          title: `${editing.tailNumber} checklists`,
          content: <ChecklistPage airplane={`mine:${editing.id}`} name={editing.tailNumber} />,
        },
        [`squawks-${editing.id}`]: { title: `${editing.tailNumber} squawks`, content: <SquawksPage aircraft={editing} /> },
      }
    : {};

  // The tab says what this is: no heading over the list, only the
  // group's own, as an iOS page under a segmented control has.
  return (
    <ConsolePages back="Airplanes" pages={checklistPages}>
      <section aria-label="Airplanes">
        {isLoading ? (
          <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
            Fetching your airplanes…
          </p>
        ) : (
          // A grouped list at every width, as iOS lists things: a row per
          // airplane, and New aircraft as the last row. It was a card per
          // airplane with an Edit and a Delete on each on a phone, a table
          // from md up, and a small plus beside the heading as the only way
          // to add one; then a row that opened the form, and which one the
          // nav log flew was said only under the route.
          <ResponsivePopover
            open={formOpen}
            onOpenChange={(open, details) => {
              // A row, tapped while the form is open, is not "outside": it
              // switches the form to that airplane, where the stock
              // dismissal would have closed it on the press and reopened it
              // empty on the click.
              if (!open && details?.reason === "outside-press") {
                const at = details.event.target;
                if (at instanceof Element && at.closest("[data-aircraft-edit]")) return details.cancel();
              }
              if (open) setAdding(true);
              else cancelEdit();
            }}
          >
            {/* The one flown a radio group's choice (ListChoices): arrow keys
              between the airplanes, VoiceOver's "selected", and iOS's tick. */}
            <ListChoices
              label="Your airplanes"
              value={aircraftKey(flying)}
              onChange={(key) => {
                const a = list?.find((x) => `mine:${x.id}` === key);
                if (a) fly(choiceOf(a, profiles ?? []));
              }}
            >
              <ListGroup title="Your airplanes">
                {/* Which the nav log flies where it is none of these, said in its
                place as a row: the one ticked otherwise. */}
                {!!list?.length && flying.aircraftId == null && (
                  <ListRow muted title={<>Flying the stock {flying.label}</>} data-testid="aircraft-stock" />
                )}
                {(list ?? []).map((a) => {
                  return (
                    <div key={a.id} className="flex items-center" data-aircraft-row>
                      {/* The tick before the name, its place kept when it is
                      elsewhere so the names line up, as Wi-Fi's are. */}
                      <ListRow
                        className="min-w-0 flex-1"
                        radio={`mine:${a.id}`}
                        title={
                          <>
                            <span className="font-mono font-semibold">{a.tailNumber}</span>{" "}
                            <span className="text-muted-foreground">{a.typeDesignator}</span>
                          </>
                        }
                        description={`Cruise ${a.cruiseTasKt} kt, ${a.fuelBurnGph} gph${a.cruisePowerPct != null ? ` at ${a.cruisePowerPct}%` : ""}${
                          a.usableFuelGal != null ? ` · ${a.usableFuelGal} gal usable` : ""
                        }`}
                      />
                      <IconButton
                        label={`Edit ${a.tailNumber}`}
                        onClick={() => edit(a)}
                        className="mr-1.5 shrink-0 text-tint"
                        // Not "outside" the open form: tapped with it open, the
                        // form switches to this airplane (see the popover's onOpenChange).
                        data-aircraft-edit
                      >
                        <Info className="size-5" />
                      </IconButton>
                    </div>
                  );
                })}
                <ResponsivePopoverTrigger asChild>
                  <ListRow
                    title={
                      <span className="flex items-center gap-2 font-medium">
                        <Plus className="size-4" />
                        New airplane
                      </span>
                    }
                    data-testid="new-aircraft-button"
                  />
                </ResponsivePopoverTrigger>
              </ListGroup>
            </ListChoices>
            {/* On a phone a sheet from the navigation bar's edge, over the
              console's own; from md up a popover by the rows. Cancel and
              Add (or Save) in its title row, as an iOS form sheet has
              them; each field a row, its label at the start and the
              field at the end, units inside. */}
            <ResponsivePopoverContent
              title={editingId ? "Edit airplane" : "New airplane"}
              align="start"
              className="w-80"
              leading={
                <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={cancelEdit}>
                  Cancel
                </Button>
              }
              action={
                // A spinner while it saves: disabled alone looked like
                // nothing was happening. The name stays the words.
                <Button
                  type="submit"
                  form={formElementId}
                  size="sm"
                  className="-mr-1"
                  disabled={saving}
                  aria-busy={saving}
                  aria-label={editingId ? "Save changes" : "Add airplane"}
                >
                  {saving && <Spinner role="presentation" aria-label={undefined} aria-hidden />}
                  {editingId ? "Save" : "Add"}
                </Button>
              }
            >
              <form id={formElementId} className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* What the gateway refused of the last save, over the fields typed as they were. */}
                {errors.root?.server && (
                  <FieldError className={cn("px-1 text-destructive", TEXT.note)} data-testid="aircraft-problem">
                    {errors.root.server.message}
                  </FieldError>
                )}
                {/* What the airplane is, then its speeds and fuel burns --
                  climb and cruise, a row each under the group's heading
                  -- and the power the cruise is at, then its tanks. Each
                  field keeps its label and unit while it is typed in; the
                  placeholders are examples. The accessible names say the
                  phase and the units in full. The identifiers are
                  capitals and never autocorrected. */}
                <ListGroup>
                  <ListRow id={`${formId}-tail`} title="Tail number" description={problem(errors.tailNumber?.message)}>
                    <FieldHit htmlFor={`${formId}-tail`}>
                      <Input
                        id={`${formId}-tail`}
                        {...register("tailNumber")}
                        placeholder="N12345"
                        className="h-8 w-32 text-right"
                        aria-label="Tail number"
                        aria-invalid={!!errors.tailNumber}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FieldHit>
                  </ListRow>
                  <ListRow id={`${formId}-type`} title="Type" description={problem(errors.typeDesignator?.message)}>
                    <FieldHit htmlFor={`${formId}-type`}>
                      <Input
                        id={`${formId}-type`}
                        {...register("typeDesignator")}
                        placeholder="C172"
                        className="h-8 w-32 text-right"
                        aria-label="Type designator"
                        aria-invalid={!!errors.typeDesignator}
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
                  air (wingtip.performance): the handbook cruise table's at this
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
                  <ListRow id={`${formId}-equipment`} title="Equipment" description={problem(errors.equipment?.message)}>
                    <FieldHit htmlFor={`${formId}-equipment`}>
                      <Input
                        id={`${formId}-equipment`}
                        {...register("equipment")}
                        placeholder="SDFGRY"
                        maxLength={40}
                        className="h-8 w-32 text-right font-mono uppercase"
                        aria-label="Equipment, flight plan item 10a"
                        aria-invalid={!!errors.equipment}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FieldHit>
                  </ListRow>
                  <ListRow id={`${formId}-surveillance`} title="Surveillance" description={problem(errors.surveillance?.message)}>
                    <FieldHit htmlFor={`${formId}-surveillance`}>
                      <Input
                        id={`${formId}-surveillance`}
                        {...register("surveillance")}
                        placeholder="B1"
                        maxLength={20}
                        className="h-8 w-32 text-right font-mono uppercase"
                        aria-label="Surveillance, flight plan item 10b"
                        aria-invalid={!!errors.surveillance}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FieldHit>
                  </ListRow>
                  <ListRow id={`${formId}-colour`} title="Color" description={problem(errors.colour?.message)}>
                    <FieldHit htmlFor={`${formId}-colour`}>
                      <Input
                        id={`${formId}-colour`}
                        {...register("colour")}
                        placeholder="White, blue stripe"
                        maxLength={40}
                        className="h-8 w-40 text-right"
                        aria-label="Color and markings, flight plan item 19"
                        aria-invalid={!!errors.colour}
                      />
                    </FieldHit>
                  </ListRow>
                </ListGroup>
                {editing && (
                  <ListGroup>
                    <PageRow
                      page={`checklist-${editing.id}`}
                      title="Checklists"
                      description="Normal and emergency, yours from its handbook, kept on this device"
                    />
                    <PageRow
                      page={`squawks-${editing.id}`}
                      title="Squawks"
                      description="What was found, and its fix"
                      value={editing.openSquawks?.length ? `${editing.openSquawks.length} open` : undefined}
                    />
                  </ListGroup>
                )}
                {editing && <InspectionsGroup key={editing.id} aircraft={editing} />}
                {editing && <DueItemsGroup aircraft={editing} />}
                {editing && <VorCheckGroup aircraft={editing} />}
                {editingId !== null && (
                  <ListGroup>
                    <ListRow
                      title={<span className="font-medium text-destructive">Delete airplane</span>}
                      onClick={askDelete}
                      data-testid="delete-aircraft-button"
                    />
                  </ListGroup>
                )}
              </form>
            </ResponsivePopoverContent>
            {deleteDialog}
          </ResponsivePopover>
        )}
      </section>
    </ConsolePages>
  );
}

// The saved flights, their own module now (flights/), still reached
// through this chunk as PlanSidebar and Setup load it.
export { FlightsPanel } from "./flights/FlightsPanel";
