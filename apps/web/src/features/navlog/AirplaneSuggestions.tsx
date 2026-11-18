import { cn } from "cn";
import { ComboboxGroup, ComboboxItem, ComboboxLabel, ComboboxList } from "../../components/ui/combobox";
import { TEXT } from "../../lib/text";
import type { AirplaneRow } from "../plan";

/** One suggestion: its row and what a pick does. */
export type SuggestionRow = AirplaneRow & { pick: () => void; disabled?: boolean };

/** One group of the airplane field's suggestions: its heading and rows. */
export interface SuggestionGroup {
  heading: string;
  rows: SuggestionRow[];
}

/**
 * The FPL airplane field's suggestions as it is typed (the owner, 2026-11-14,
 * S1 on https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253): Your airplanes,
 * Recent and kept, the FAA registry, Types, from the one search's own source
 * (useAirplaneHits), each a row of the stock Combobox's list (ui/combobox)
 * round the field, so its arrows and Enter pick and Escape closes it; a pick
 * is the root's `onValueChange` (FlightInputs). No row is ever the field's
 * value, so no tick and no room kept for one. Each row's two lines make it
 * 44 points or more to a finger, nothing grown for it.
 */
export default function AirplaneSuggestions({ groups }: { groups: SuggestionGroup[] }) {
  return (
    <ComboboxList className="max-h-80">
      {groups.map((g) => (
        <ComboboxGroup key={g.heading} data-testid={`aircraft-suggestions-${g.heading.split(" ")[0]!.toLowerCase()}`}>
          <ComboboxLabel>{g.heading}</ComboboxLabel>
          {g.rows.map((row) => (
            <ComboboxItem
              key={row.key}
              value={row}
              disabled={row.disabled}
              className="flex-col items-start gap-0 pl-4 native:pl-2"
              data-testid="aircraft-suggestion"
            >
              <span className={cn("font-semibold text-foreground", TEXT.row)}>{row.title}</span>
              <span className={cn("text-muted-foreground", TEXT.detail)}>{row.detail}</span>
            </ComboboxItem>
          ))}
        </ComboboxGroup>
      ))}
    </ComboboxList>
  );
}
