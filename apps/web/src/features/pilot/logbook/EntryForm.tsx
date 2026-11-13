import { useCallback, useEffect, type KeyboardEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBeforeUnload } from "react-router";
import { FormDateField } from "../../../components/FormFields";
import { cn } from "cn";
import { useConfirm } from "../../../components/useConfirm";
import TogglePill from "../../../components/TogglePill";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { NumberField } from "../../../components/ui/number-field";
import type { LogbookEntryRequest } from "../../../lib/api/types";
import { TEXT } from "../../../lib/text";
import { entryProblems } from "./entryChecks";
import { FieldError } from "../../../components/ui/field";

/**
 * One entry's form: a paper logbook's columns. In the plus's popover for a
 * new flight, and in the flight's own row for one logged (LogbookFlights),
 * where Cancel and Escape put the row back as it was.
 *
 * Save is never greyed out ahead of time (Vercel's interface guidelines,
 * web.md §9): pressed with a field missing, the field says what it needs
 * under it and takes the focus, the first of them. What was typed is not
 * thrown away unasked: Cancel or Escape on a changed form asks first, and
 * the page's own leaving (a reload, a closed tab) the browser asks about.
 */
export default function EntryForm({
  initial,
  onSave,
  onCancel,
  saving,
  problem,
  onDirtyChange,
}: {
  initial: LogbookEntryRequest;
  onSave: (r: LogbookEntryRequest) => void;
  /** In a row: the row back, nothing saved. */
  onCancel?: () => void;
  saving: boolean;
  /** Why the gateway refused the last save, said over the form's buttons. */
  problem?: string | null;
  /** Whether what is typed differs from what the form opened on, for a
   *  popover round it to ask before it closes on it. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  // react-hook-form keeps what is typed, whether it differs from what the
  // form opened on (isDirty), what is missing (the resolver, from
  // entryProblems) and, on Save, the focus on the first field that needs
  // something (shouldFocusError). An empty box and none are one to the
  // pilot, so the form opens on "" where the flight has none.
  const {
    control,
    register,
    handleSubmit,
    formState: { isDirty: dirty, errors },
  } = useForm<LogbookEntryRequest>({
    defaultValues: blanksAsEmpty(initial),
    resolver: (values) => {
      const found = entryProblems(values);
      const keys = Object.keys(found) as (keyof LogbookEntryRequest)[];
      return keys.length
        ? { values: {}, errors: Object.fromEntries(keys.map((key) => [key, { type: "required", message: found[key] }])) }
        : { values, errors: {} };
    },
  });
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // The browser's own question before a changed form is left with the page.
  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (dirty) e.preventDefault();
      },
      [dirty],
    ),
  );
  const [askDiscard, discardDialog] = useConfirm({
    title: "Discard Changes?",
    description: "What you typed in this flight is not saved.",
    confirmLabel: "Discard",
    destructive: true,
    onConfirm: () => onCancel?.(),
  });
  const cancel = () => (dirty ? askDiscard() : onCancel?.());
  // In a row, Escape in a field puts the row back: the row's own, not the
  // sheet's close as well.
  const escape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !onCancel) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  };
  // React Aria's own fields' Escape: its events stop where they are heard
  // already, and say so if told to again.
  const escapeAria = (e: { key: string; preventDefault: () => void }) => {
    if (e.key !== "Escape" || !onCancel) return;
    e.preventDefault();
    cancel();
  };
  const field = (key: keyof LogbookEntryRequest, label: string, type: "text" | "number" | "date" = "text") => {
    const said = errors[key]?.message;
    // A figure on React Aria's number field and the day on its date
    // field, where the native ones were, each named by its label.
    const box =
      type === "number" ? (
        <Controller
          control={control}
          name={key}
          render={({ field: bound }) => (
            <NumberField
              aria-label={label}
              className="h-8"
              minValue={0}
              data-testid={`logbook-${key}`}
              value={bound.value == null || bound.value === "" ? null : Number(bound.value)}
              onChange={(v) => bound.onChange(v ?? 0)}
              onBlur={bound.onBlur}
              onKeyDown={escapeAria}
            />
          )}
        />
      ) : type === "date" ? (
        <FormDateField
          control={control}
          name={key}
          aria-label={label}
          className="h-8"
          data-testid={`logbook-${key}`}
          onKeyDown={escapeAria}
          isInvalid={!!said}
        />
      ) : (
        <Input className="h-8" data-testid={`logbook-${key}`} {...register(key)} onKeyDown={escape} />
      );
    return (
      <div data-field={key}>
        <label className={cn("grid grid-cols-[8rem_1fr] items-center gap-2", TEXT.detail)}>
          <span>{label}</span>
          {box}
        </label>
        {/* Said under its own field, where the eye is (WCAG 3.3.1). */}
        {said && (
          <p className={cn("mt-1 pl-34 text-destructive-ink", TEXT.note)} data-testid={`logbook-${key}-problem`}>
            {said}
          </p>
        )}
      </div>
    );
  };
  return (
    <form className="space-y-2.5" noValidate onSubmit={(e) => void handleSubmit(onSave)(e)}>
      {field("flownOn", "Date", "date")}
      {field("route", "Route")}
      {field("aircraft", "Airplane")}
      {field("aircraftType", "Type")}
      {field("totalHours", "Total hours", "number")}
      {field("nightHours", "Night hours", "number")}
      {field("crossCountryHours", "Cross-country", "number")}
      {field("dayLandings", "Day landings", "number")}
      {field("nightLandings", "Night landings", "number")}
      {/* What a student's 61.109 experience is counted from: the
          Checkride page. */}
      {field("dualHours", "Dual received", "number")}
      {field("soloHours", "Solo", "number")}
      {field("instrumentHours", "Sim. instrument", "number")}
      {field("toweredLandings", "Towered landings", "number")}
      {field("distanceNm", "Distance (nm)", "number")}
      {field("longestLegNm", "Longest leg (nm)", "number")}
      {/* What instrument currency is counted from (14 CFR 61.57(c)): the
          approaches, holding and tracking courses, actual or simulated. */}
      {field("approaches", "Approaches", "number")}
      <div className={cn("grid grid-cols-[8rem_1fr] items-center gap-2", TEXT.detail)}>
        <span>Also flew</span>
        <span className="flex gap-2">
          <Controller
            control={control}
            name="holding"
            render={({ field: bound }) => (
              <TogglePill pressed={!!bound.value} onPressedChange={bound.onChange} label="Holding" testId="logbook-holding" />
            )}
          />
          <Controller
            control={control}
            name="tracking"
            render={({ field: bound }) => (
              <TogglePill pressed={!!bound.value} onPressedChange={bound.onChange} label="Tracking" testId="logbook-tracking" />
            )}
          />
        </span>
      </div>
      {field("remarks", "Remarks")}
      {problem && (
        <FieldError className={cn("text-destructive", TEXT.note)} data-testid="logbook-problem">
          {problem}
        </FieldError>
      )}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={cancel} data-testid="logbook-cancel">
            Cancel
          </Button>
        )}
        {/* Busy while sending, never greyed for what is missing. */}
        <Button type="submit" size="sm" disabled={saving} aria-busy={saving} data-testid="logbook-save">
          Save
        </Button>
      </div>
      {discardDialog}
    </form>
  );
}

/** The flight with "" where it has none, as the boxes hold an empty one. */
function blanksAsEmpty(entry: LogbookEntryRequest): LogbookEntryRequest {
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value ?? ""])) as LogbookEntryRequest;
}
