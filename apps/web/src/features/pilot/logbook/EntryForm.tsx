import { useState, type KeyboardEvent } from "react";
import { cn } from "cn";
import TogglePill from "../../../components/TogglePill";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { LogbookEntryRequest } from "../../../lib/api/types";
import { TEXT } from "../../../lib/text";

/**
 * One entry's form: a paper logbook's columns. In the plus's popover for a
 * new flight, and in the flight's own row for one logged (LogbookFlights),
 * where Cancel and Escape put the row back as it was.
 */
export default function EntryForm({
  initial,
  onSave,
  onCancel,
  saving,
  problem,
}: {
  initial: LogbookEntryRequest;
  onSave: (r: LogbookEntryRequest) => void;
  /** In a row: the row back, nothing saved. */
  onCancel?: () => void;
  saving: boolean;
  /** Why the gateway refused the last save, said over the form's buttons. */
  problem?: string | null;
}) {
  const [entry, setEntry] = useState(initial);
  // In a row, Escape in a field puts the row back: the row's own, not the
  // sheet's close as well.
  const escape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !onCancel) return;
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };
  const field = (key: keyof LogbookEntryRequest, label: string, type: "text" | "number" | "date" = "text") => (
    <label className={cn("grid grid-cols-[8rem_1fr] items-center gap-2", TEXT.detail)}>
      <span>{label}</span>
      <Input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "any" : undefined}
        min={type === "number" ? 0 : undefined}
        className="h-8"
        data-testid={`logbook-${key}`}
        value={(entry[key] as string | number | null | undefined) ?? ""}
        onChange={(e) => setEntry({ ...entry, [key]: type === "number" ? Number(e.target.value || 0) : e.target.value })}
        onKeyDown={escape}
      />
    </label>
  );
  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
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
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} data-testid="logbook-cancel">
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={saving || !entry.flownOn} data-testid="logbook-save">
          Save
        </Button>
      </div>
    </form>
  );
}
