import { Fragment, type ReactNode } from "react";
import { BookOpenCheck, Diamond, LocateFixed, MoveUpRight, Navigation, Plane, Search, Siren, SquareArrowOutUpRight } from "lucide-react";
import { cn } from "cn";
import { AirportDetail } from "../../../../components/AirportResults";
import { CommandEmpty, CommandList, CommandShortcut } from "../../../../components/ui/command";
import { TEXT } from "../../../../lib/text";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "../../../../components/ui/preview-card";
import { usePointerHover } from "../../../../hooks/use-pointer-hover";
import { keyHint } from "../../../../lib/shortcutKeys";
import type { AirportSearchRow } from "../../../../lib/useAirportSearch";
import AirportPreview from "../preview/AirportPreview";
import type { AirplaneHit, DoHit, OneSearchModel } from "../../hooks/useOneSearch";
import { useVoiceInput } from "../../../voice";
import { AirportIcon, Matched, QuickAction, ResultGroup, ResultRow, RoundIcon, RowLine } from "./ResultRows";
import { FieldError } from "../../../../components/ui/field";

/** A Do row's glyph: the arrow for Direct To, My Position's filled one,
 *  the Brief's, Nearest's, the emergency's in red, the traffic's, a screen's. */
function doGlyph(hit: DoHit) {
  if (hit.key.startsWith("direct")) return <MoveUpRight />;
  if (hit.key === "my-position") return <Navigation className="fill-current" />;
  if (hit.key === "screen-brief") return <BookOpenCheck />;
  if (hit.key === "screen-nearest") return <LocateFixed />;
  if (hit.key === "screen-emergency") return <Siren className="text-destructive-ink" />;
  if (hit.key === "traffic") return <Plane />;
  return <SquareArrowOutUpRight />;
}

/** Rows with the hairline between each two. */
function lined<T>(items: T[], key: (item: T) => string, row: (item: T) => ReactNode) {
  return items.map((item, i) => (
    <Fragment key={key(item)}>
      {i > 0 && <RowLine />}
      {row(item)}
    </Fragment>
  ));
}

/**
 * What answers the one search (the owner's one-search design, 2026-11-09),
 * laid out as Apple Maps on the web lays out a search typed (the owner's
 * screenshot, 2026-11-10): one white group, the top hit first with its
 * quick actions in it (an airport's Fly Here and Depart From, one of the
 * pilot's airplanes' Fly This Airplane), then the suggestion -- the words
 * sent round a place, on a grey magnifier -- then the rest: the
 * airports, the waypoints and navaids, the airplanes and what can be done,
 * each on its round icon, a hairline between rows. Every row is still Base
 * UI Autocomplete's item in a named group, so the field's arrows and Enter
 * walk them and a screen reader hears each group's name (OneSearchField
 * holds the field, the same Autocomplete root round both), the first row
 * highlighted for Enter (its autoHighlight). Asked for Direct To, the
 * airports alone, and why one could not be flown said here (lib/problems'
 * rule: where it happens).
 */
export default function OneSearchResults({ model }: { model: OneSearchModel }) {
  const { airports, waypoints, airplanes, does, answered, direct, typed, problem, actionable } = model;
  // A mouse resting on an airport's row: its preview beside the panel
  // (the owner, 2026-11-09: hover previews on pointer devices only).
  const hover = usePointerHover();
  // The suggestion: the words sent round a place (Search Nearby).
  const asks = does.filter((d) => d.kind === "nearby");
  const rest = does.filter((d) => d.kind !== "nearby");
  // The top hit: the first airport, else the first airplane.
  const topAirport = airports[0] ?? null;
  const topAirplane = topAirport ? null : (airplanes[0] ?? null);
  const moreAirports = topAirport ? airports.slice(1) : airports;
  const moreAirplanes = topAirplane ? airplanes.slice(1) : airplanes;
  // Why the mic heard nothing (features/voice), here as the search's own.
  const unheard = useVoiceInput((s) => (s.error?.field === "search" ? s.error.text : null));
  const none = airports.length + waypoints.length + airplanes.length + does.length === 0;

  const airportRow = (r: AirportSearchRow, top: boolean) => {
    const row = (
      <ResultRow
        key={r.ident}
        value={r.ident}
        icon={<AirportIcon ident={r.ident} name={r.name} kept={top} />}
        title={
          <>
            <span className="font-mono">
              <Matched text={r.ident} typed={typed} />
            </span>{" "}
            · <Matched text={r.name} typed={typed} />
          </>
        }
        detail={r.closed || r.use ? <AirportDetail closed={r.closed} use={r.use} municipality={r.municipality} /> : r.municipality}
        onSelect={() => model.pickAirport(r)}
        testId="airport-result"
        actions={
          top && actionable
            ? model
                .quick(r)
                .map((a, _i, all) => (
                  <QuickAction key={a.testId} label={a.label} onClick={a.run} testId={a.testId} wide={all.length === 1} />
                ))
            : undefined
        }
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
  };
  const airplaneRow = (a: AirplaneHit, top: boolean) => (
    <ResultRow
      key={a.key}
      value={a.key}
      icon={
        <RoundIcon tone="tint">
          <Plane />
        </RoundIcon>
      }
      title={
        <span className="font-mono">
          <Matched text={a.title} typed={typed} />
        </span>
      }
      detail={a.detail}
      onSelect={a.pick}
      testId="search-airplane"
      actions={
        top && a.fly ? (
          <QuickAction label="Fly This Airplane" onClick={() => model.flyAirplane(a)} testId="search-top-fly-airplane" />
        ) : undefined
      }
    />
  );
  const doRow = (hit: DoHit) => (
    <ResultRow
      key={hit.key}
      value={hit.key}
      icon={<RoundIcon>{hit.kind === "nearby" ? <Search /> : doGlyph(hit)}</RoundIcon>}
      title={hit.kind === "nearby" ? <Matched text={hit.label} typed={typed} /> : hit.label}
      detail={hit.kind === "nearby" ? "Search Nearby" : undefined}
      onSelect={hit.run}
      testId={`search-do-${hit.key}`}
      // What is done in the tint, as a button's words are; the
      // suggestion in the text's colour as Apple's are.
      tint={hit.kind !== "nearby"}
      end={hit.keys ? <CommandShortcut className="self-center">{keyHint(hit.keys)}</CommandShortcut> : undefined}
    />
  );

  // The groups in Apple's order, a hairline between each two as between rows.
  const groups: { heading: string; rows: ReactNode }[] = [];
  if (topAirport) groups.push({ heading: direct ? "Direct To" : "Top Hit", rows: airportRow(topAirport, true) });
  else if (topAirplane) groups.push({ heading: "Top Hit", rows: airplaneRow(topAirplane, true) });
  if (asks.length > 0) groups.push({ heading: "Suggestions", rows: lined(asks, (d) => d.key, doRow) });
  if (moreAirports.length > 0)
    groups.push({
      heading: direct ? "Direct To" : "Airports",
      rows: lined(
        moreAirports,
        (r) => r.ident,
        (r) => airportRow(r, false),
      ),
    });
  if (waypoints.length > 0)
    groups.push({
      heading: "Waypoints and Navaids",
      rows: lined(
        waypoints,
        (r) => r.ident,
        (r) => (
          <ResultRow
            value={`fix:${r.ident}`}
            icon={
              <RoundIcon>
                {/* Its magenta as fill and stroke, as the map marks one. */}
                <Diamond className="fill-(--airspace-magenta-text) stroke-(color:--airspace-magenta-text)" />
              </RoundIcon>
            }
            title={
              <>
                <span className="font-mono">
                  <Matched text={r.ident} typed={typed} />
                </span>{" "}
                · <Matched text={r.name} typed={typed} />
              </>
            }
            detail={r.region}
            onSelect={() => model.pickWaypoint(r.ident)}
            testId="search-waypoint"
          />
        ),
      ),
    });
  if (moreAirplanes.length > 0)
    groups.push({
      heading: "Airplanes",
      rows: lined(
        moreAirplanes,
        (a) => a.key,
        (a) => airplaneRow(a, false),
      ),
    });
  if (rest.length > 0) groups.push({ heading: "Do", rows: lined(rest, (d) => d.key, doRow) });

  return (
    // Its sides the page's own sixteen (TabPage), where its own sixteen
    // more put the list 32 in (the sheet audit's F-P1).
    <div className="flex flex-col gap-2 pt-2 pb-4" data-testid="one-search-results">
      {problem && (
        <FieldError className={cn("appear text-destructive-ink", TEXT.note)} data-testid="one-search-problem">
          {problem}
        </FieldError>
      )}
      {unheard && (
        <FieldError className={cn("appear text-destructive-ink", TEXT.note)} data-testid="one-search-voice-problem">
          {unheard}
        </FieldError>
      )}
      <CommandList
        className={cn("max-h-none overflow-hidden rounded-2xl bg-card p-0", none && "bg-transparent", !answered && "opacity-60")}
        aria-busy={!answered}
        aria-label="Search results"
      >
        {groups.map((g, i) => (
          <Fragment key={`${i}-${g.heading}`}>
            {i > 0 && <RowLine />}
            <ResultGroup heading={g.heading}>{g.rows}</ResultGroup>
          </Fragment>
        ))}
        {/* Base UI's status, kept mounted so VoiceOver hears "Nothing
            found" as it comes; empty while there are rows. */}
        <CommandEmpty className={cn("px-1 text-muted-foreground", TEXT.prose)}>
          {none && (direct && !typed ? "Type an airport's ident or name." : answered ? "Nothing found." : "Searching…")}
        </CommandEmpty>
      </CommandList>
    </div>
  );
}
