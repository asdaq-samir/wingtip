import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import RowField from "../../../components/RowField";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import type { FlightSummary } from "../../../lib/api/types";
import { invalidProps } from "../../../lib/fieldError";
import { routeName } from "../../../lib/identSchema";
import { NAME_MAX, NOTES_MAX } from "./flightEdit";

/**
 * A saved flight's name and notes, in its row's place: Return or leaving
 * the two fields saves them, Escape puts the row back as it was (Shift
 * Return is a new line in the notes). What went wrong is said under the
 * name, in the row, as a form's field says it (RowField), not in a toast.
 */
export default function FlightFields({
  flight,
  problem,
  saving,
  onSave,
  onCancel,
}: {
  flight: FlightSummary;
  problem: string | null;
  saving: boolean;
  onSave: (name: string, notes: string) => void;
  onCancel: () => void;
}) {
  const nameId = useId();
  const notesId = useId();
  const [name, setName] = useState(flight.name ?? "");
  const [notes, setNotes] = useState(flight.notes ?? "");
  const box = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  // Opened by Edit or the name tapped: the name ready to type, as a
  // rename is on iOS.
  useEffect(() => nameField.current?.focus(), []);
  // Escape has put the row back: the blur its fields going away may bring
  // saves nothing.
  const cancelled = useRef(false);
  // What was last sent: the blur its fields going away after a save may
  // bring sends it again for nothing. Return always sends, to try again.
  const sent = useRef<string | null>(null);
  const save = (again: boolean) => {
    const asked = `${name}\u0000${notes}`;
    if (!again && sent.current === asked) return;
    sent.current = asked;
    onSave(name, notes);
  };
  const keys = (event: KeyboardEvent, lines: boolean) => {
    if (event.key === "Escape") {
      // The row's own: not the sheet's close as well.
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
      onCancel();
    } else if (event.key === "Enter" && !(lines && event.shiftKey)) {
      event.preventDefault();
      save(true);
    }
  };
  return (
    <div
      ref={box}
      className="space-y-2 p-2"
      data-testid="saved-flight-fields"
      onBlur={(event) => {
        if (cancelled.current || box.current?.contains(event.relatedTarget as Node | null)) return;
        save(false);
      }}
    >
      <RowField id={nameId} error={problem ?? undefined} wide>
        <Input
          id={nameId}
          ref={nameField}
          value={name}
          maxLength={NAME_MAX}
          readOnly={saving}
          enterKeyHint="done"
          placeholder={routeName(flight.departureIdent, flight.destinationIdent, flight.stops)}
          aria-label="Flight name"
          {...invalidProps(nameId, problem ?? undefined)}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => keys(e, false)}
          data-testid="saved-flight-name"
        />
      </RowField>
      <Textarea
        id={notesId}
        value={notes}
        rows={2}
        maxLength={NOTES_MAX}
        readOnly={saving}
        placeholder="Notes"
        aria-label="Flight notes"
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => keys(e, true)}
        data-testid="saved-flight-notes"
      />
    </div>
  );
}
