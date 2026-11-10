import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "cn";
import { useConfirm } from "../../../components/useConfirm";
import TogglePill from "../../../components/TogglePill";
import { Button } from "../../../components/ui/button";
import { DateField } from "../../../components/ui/date-field";
import { Input } from "../../../components/ui/input";
import { NumberField } from "../../../components/ui/number-field";
import type { LogbookEntryRequest } from "../../../lib/api/types";
import { TEXT } from "../../../lib/text";
import { entryProblems, sameEntry, type EntryProblems } from "./entryChecks";

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
  const [entry, setEntry] = useState(initial);
  const [problems, setProblems] = useState<EntryProblems>({});
  const form = useRef<HTMLFormElement>(null);
  const dirty = !sameEntry(entry, initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // The browser's own question before a changed form is left with the page.
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
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
    const now = entry[key] as string | number | null | undefined;
    // A figure on React Aria's number field and the day on its date
    // field, where the native ones were, each named by its label.
    const control =
      type === "number" ? (
        <NumberField
          aria-label={label}
          className="h-8"
          minValue={0}
          data-testid={`logbook-${key}`}
          value={now == null || now === "" ? null : Number(now)}
          onChange={(v) => setEntry({ ...entry, [key]: v ?? 0 })}
          onKeyDown={escapeAria}
        />
      ) : type === "date" ? (
        <DateField
          aria-label={label}
          className="h-8"
          data-testid={`logbook-${key}`}
          value={String(now ?? "")}
          onChange={(day) => setEntry({ ...entry, [key]: day })}
          onKeyDown={escapeAria}
          isInvalid={!!problems[key]}
        />
      ) : (
        <Input
          className="h-8"
          data-testid={`logbook-${key}`}
          value={now ?? ""}
          onChange={(e) => setEntry({ ...entry, [key]: e.target.value })}
          onKeyDown={escape}
        />
      );
    const said = problems[key];
    return (
      <div data-field={key}>
        <label className={cn("grid grid-cols-[8rem_1fr] items-center gap-2", TEXT.detail)}>
          <span>{label}</span>
          {control}
        </label>
        {/* Said under its own field, where the eye is (WCAG 3.3.1). */}
        {said && (
          <p className={cn("mt-1 pl-[8.5rem] text-destructive-ink", TEXT.note)} data-testid={`logbook-${key}-problem`}>
            {said}
          </p>
        )}
      </div>
    );
  };
  return (
    <form
      ref={form}
      className="space-y-2.5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = entryProblems(entry);
        setProblems(found);
        const first = Object.keys(found)[0];
        if (first) {
          // The first field that needs something, focused: its input, or
          // React Aria's first segment.
          form.current
            ?.querySelector<HTMLElement>(`[data-field="${first}"] :is(input, [role="spinbutton"], [contenteditable="true"])`)
            ?.focus();
          return;
        }
        onSave(entry);
      }}
    >
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
          <TogglePill
            pressed={entry.holding}
            onPressedChange={(holding) => setEntry({ ...entry, holding })}
            label="Holding"
            testId="logbook-holding"
          />
          <TogglePill
            pressed={entry.tracking}
            onPressedChange={(tracking) => setEntry({ ...entry, tracking })}
            label="Tracking"
            testId="logbook-tracking"
          />
        </span>
      </div>
      {field("remarks", "Remarks")}
      {problem && (
        <p role="alert" className={cn("text-destructive", TEXT.note)} data-testid="logbook-problem">
          {problem}
        </p>
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
