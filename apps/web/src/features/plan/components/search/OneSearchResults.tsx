import { BookOpenCheck, LocateFixed, MessageCircleQuestion, MoveUpRight, Plane, Siren, SquareArrowOutUpRight } from "lucide-react";
import { cn } from "cn";
import { AirportRow, PickerGroup } from "../../../../components/AirportResults";
import { CommandItem, CommandList, CommandShortcut } from "../../../../components/ui/command";
import { TEXT } from "../../../../lib/text";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "../../../../components/ui/preview-card";
import { usePointerHover } from "../../../../hooks/use-pointer-hover";
import AirportPreview from "../preview/AirportPreview";
import type { DoHit, OneSearchModel } from "../../hooks/useOneSearch";

/** A Do row's glyph: the arrow for Direct To, the Brief's, Nearest's, the
 *  emergency's in red, the assistant's, a screen's. */
function doGlyph(hit: DoHit) {
  if (hit.kind === "ask") return <MessageCircleQuestion />;
  if (hit.key.startsWith("direct")) return <MoveUpRight />;
  if (hit.key === "screen-brief") return <BookOpenCheck />;
  if (hit.key === "screen-nearest") return <LocateFixed />;
  if (hit.key === "screen-emergency") return <Siren className="text-destructive-ink" />;
  if (hit.key === "traffic") return <Plane />;
  return <SquareArrowOutUpRight />;
}

/**
 * What answers the one search (the owner's one-search design, 2026-11-09),
 * one list in the sheet's body in four groups -- Airports, Waypoints and
 * Navaids, Airplanes, Do -- each row Base UI Autocomplete's item, so the
 * field's arrows and Enter walk them and a screen reader hears each group's
 * name with its rows (OneSearchField holds the field, the same
 * Autocomplete root round both). Asked for Direct To, the airports alone,
 * under that name, and why one could not be flown said here (lib/problems'
 * rule: where it happens).
 */
export default function OneSearchResults({ model }: { model: OneSearchModel }) {
  const { airports, waypoints, airplanes, does, answered, direct, typed, problem } = model;
  // A mouse resting on an airport's row: its preview beside the panel
  // (the owner, 2026-11-09: hover previews on pointer devices only).
  const hover = usePointerHover();
  const none = airports.length + waypoints.length + airplanes.length + does.length === 0;
  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-4" data-testid="one-search-results">
      {problem && (
        <p role="alert" className={cn("appear text-destructive-ink", TEXT.note)} data-testid="one-search-problem">
          {problem}
        </p>
      )}
      <CommandList
        className={cn("max-h-none overflow-visible", !answered && "opacity-60")}
        aria-busy={!answered}
        aria-label="Search results"
      >
        {airports.length > 0 && (
          <PickerGroup heading={direct ? "Direct To" : "Airports"}>
            {airports.map((r) => {
              const row = (
                <AirportRow
                  key={r.ident}
                  airport={{ ident: r.ident, name: r.name, municipality: r.municipality }}
                  onSelect={() => model.pickAirport(r)}
                />
              );
              return hover ? (
                <PreviewCard key={r.ident}>
                  <PreviewCardTrigger render={<div role="presentation" />}>{row}</PreviewCardTrigger>
                  <PreviewCardContent>
                    <AirportPreview ident={r.ident} />
                  </PreviewCardContent>
                </PreviewCard>
              ) : (
                row
              );
            })}
          </PickerGroup>
        )}
        {waypoints.length > 0 && (
          <PickerGroup heading="Waypoints and Navaids">
            {waypoints.map((r) => (
              <AirportRow
                key={r.ident}
                waypoint
                airport={{ ident: r.ident, name: r.name, municipality: r.region }}
                onSelect={() => model.pickWaypoint(r.ident)}
                testId="search-waypoint"
              />
            ))}
          </PickerGroup>
        )}
        {airplanes.length > 0 && (
          <PickerGroup heading="Airplanes">
            {airplanes.map((a) => (
              <CommandItem
                key={a.key}
                value={a.key}
                onClick={a.pick}
                className="min-h-13 gap-3 rounded-lg px-2 py-2"
                data-testid="search-airplane"
              >
                <Plane className="size-5 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-mono font-bold", TEXT.row)}>{a.title}</span>
                  <span className={cn("block truncate text-muted-foreground", TEXT.detail)}>{a.detail}</span>
                </span>
              </CommandItem>
            ))}
          </PickerGroup>
        )}
        {does.length > 0 && (
          <PickerGroup heading="Do">
            {does.map((hit) => (
              <CommandItem
                key={hit.key}
                value={hit.key}
                onClick={hit.run}
                className="min-h-11 gap-3 rounded-lg px-2 py-2 text-tint"
                data-testid={`search-do-${hit.key}`}
              >
                {doGlyph(hit)}
                <span className={cn("min-w-0 flex-1 truncate", TEXT.row)}>{hit.label}</span>
                {hit.keys && <CommandShortcut>{hit.keys}</CommandShortcut>}
              </CommandItem>
            ))}
          </PickerGroup>
        )}
        {none && (
          <p role="status" className={cn("px-1 py-6 text-center text-muted-foreground", TEXT.prose)}>
            {direct && !typed ? "Type an airport's ident or name." : answered ? "Nothing found." : "Searching…"}
          </p>
        )}
      </CommandList>
    </div>
  );
}
