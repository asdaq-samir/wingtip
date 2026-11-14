import { cn } from "cn";
import { CommandGroup, CommandItem, CommandList } from "../../../../components/ui/command";
import { TEXT } from "../../../../lib/text";
import type { AirplaneRow } from "../../hooks/useAirplaneHits";

/** One group of the airplane field's suggestions: its heading and rows. */
export interface SuggestionGroup {
  heading: string;
  rows: (AirplaneRow & { pick: () => void; disabled?: boolean })[];
}

/**
 * The FPL airplane field's suggestions as it is typed (the owner, 2026-11-14,
 * S1 on https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253): Your airplanes,
 * Recent and kept, the FAA registry, Types, from the one search's own source
 * (useAirplaneHits), each a row of Base UI's Autocomplete list round the
 * field, so its arrows and Enter pick and Escape closes it. Each row's two
 * lines make it 44 points or more to a finger, nothing grown for it.
 */
export default function AirplaneSuggestions({ groups, onPick }: { groups: SuggestionGroup[]; onPick: (run: () => void) => void }) {
  return (
    <CommandList className="max-h-80" data-testid="aircraft-suggestions-list">
      {groups.map((g) => (
        <CommandGroup key={g.heading} heading={g.heading} data-testid={`aircraft-suggestions-${g.heading.split(" ")[0]!.toLowerCase()}`}>
          {g.rows.map((row) => (
            <CommandItem
              key={row.key}
              value={row.key}
              onClick={() => onPick(row.pick)}
              disabled={row.disabled}
              className="min-h-11 flex-col items-start gap-0"
              data-testid="aircraft-suggestion"
            >
              <span className={cn("font-semibold text-foreground", TEXT.row)}>{row.title}</span>
              <span className={cn("text-muted-foreground", TEXT.detail)}>{row.detail}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  );
}
