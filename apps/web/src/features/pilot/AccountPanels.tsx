import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus } from "lucide-react";
import IconButton from "../../components/IconButton";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { AircraftFields } from "./AircraftFields";
import { aircraftSchema, EMPTY_AIRCRAFT_FORM, type AircraftFormValues } from "./aircraftForm";
import { useAirplanes } from "./airplanes/useAirplanes";
import { Spinner } from "../../components/ui/spinner";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../components/ResponsivePopover";
import { useConfirm } from "../../components/useConfirm";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import ChecklistPage from "../../components/ChecklistPage";
import SquawksPage from "./SquawksPage";
import { aircraftKey, choiceOf } from "../../lib/aircraftChoice";
import type { Aircraft, AircraftRequest } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { TEXT } from "../../lib/text";
import { aircraftProfilesQuery } from "../../lib/queryClientRecords";
import DueItemsGroup from "./DueItemsGroup";
import { InspectionsGroup } from "./InspectionsGroup";
import { VorCheckGroup } from "./VorCheckGroup";
import { FieldError } from "../../components/ui/field";
import { WORDING } from "../../lib/wording/generated/wording";

/** A form field as the request carries it: blank is null. */
const orNull = (value: string) => (value.trim() ? Number(value) : null);

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
    category: a.kind?.category ?? "",
    aircraftClass: a.kind?.aircraftClass ?? "",
    gear: a.kind?.tailwheel == null ? "" : a.kind.tailwheel ? "tailwheel" : "tricycle",
  };
}

/** A signed-in pilot's own airplanes -- the one the nav log flies
 *  ticked, and a tap on another flies that one, as iOS lists Wi-Fi
 *  networks; the ⓘ at a row's end opens its figures to edit (the same
 *  form as a new one's), and delete. The picker under the route offers
 *  the same choice. The Library's (PilotPanel), shown only to someone
 *  signed in: it says once, for all three, what signing in keeps. */
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
        // What passenger currency is judged by (14 CFR 61.57(a)(1)(ii)), each none until said.
        kind: {
          category: values.category || null,
          aircraftClass: values.aircraftClass || null,
          tailwheel: values.gear ? values.gear === "tailwheel" : null,
        },
      },
    });
  };

  // Delete is in the airplane's own form, asked first: it was a red
  // word on every row, beside Edit.
  const editing = list?.find((a) => a.id === editingId) ?? null;
  const [askDelete, deleteDialog] = useConfirm({
    title: `Delete ${editing?.tailNumber ?? "this airplane"}?`,
    description: "It goes from your airplanes and from the nav log's picker. This can't be undone.",
    confirmLabel: WORDING.deleteAirplane,
    destructive: true,
    onConfirm: () => {
      if (editingId === null) return;
      const id = editingId;
      cancelEdit();
      remove(id);
    },
  });
  const formElementId = `${formId}-form`;

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
              <ListGroup title="Your Airplanes">
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
                        New Airplane
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
              title={editingId ? WORDING.editAirplane : WORDING.newAirplane}
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
                  aria-label={editingId ? "Save changes" : WORDING.addAirplane}
                >
                  {saving && <Spinner role="presentation" aria-label={undefined} aria-hidden />}
                  {editingId ? "Save" : "Add"}
                </Button>
              }
            >
              <form id={formElementId} className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* What the gateway refused of the last save, over the fields typed as they were. */}
                {errors.root?.server && (
                  <FieldError className={cn("px-1 text-destructive", TEXT.note)}>{errors.root.server.message}</FieldError>
                )}
                <AircraftFields formId={formId} register={register} control={control} errors={errors} />
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
                      title={<span className="font-medium text-destructive">{WORDING.deleteAirplane}</span>}
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
