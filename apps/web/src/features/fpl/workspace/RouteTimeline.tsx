import { Button as BaseButton } from "@base-ui/react/button";
import { useQueries } from "@tanstack/react-query";
import { ChevronDown, Fuel } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import StatusBadge from "../../../components/StatusBadge";
import { PANEL_FIELD_FILL } from "../../../components/panelField";
import { unknownWhy } from "../../../lib/api/client";
import { leaveWhen } from "../../../lib/format/leaveWhen";
import { identOf, isPosition, pointName } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { airportQuery } from "../../../lib/queryClient";
import { TEXT } from "../../../lib/text";
import { etaAt, placeName } from "../../plan";
import type { PlanSlices } from "../vm/planSlices";

/** The course's magenta, as the route's cards draw their rail. */
const COURSE = "var(--course)";
/** Past this many lines the middle ones fold into one (the canvas's six). */
const MOST_LINES = 4;

/** One line of the timeline: a point of the route, or the stops folded. */
type Line = { kind: "point"; ident: string; role: "dep" | "stop" | "dest" } | { kind: "more"; count: number };

/**
 * FPL's route folded to read (the one layout, decision 0046), the owner's
 * "Go" of 2026-11-17 to the canvas's "Timeline, one line each": a card on
 * the route cards' own magenta rail, one line an airport -- its dot, its
 * ident (a link to its card), its flight category from its latest METAR
 * (none where it has no report of its own), its city (NASR's, as its card
 * says it; the owner, 2026-11-17: the city, not the airport's name, which
 * stays on its card and in what VoiceOver hears; the name where a field has
 * no city), giving way first, a fuel stop's pump in the tint (its words
 * only in what VoiceOver hears; the owner, 2026-11-17: no extra words on a
 * line), and its time: the departure's when it leaves,
 * as the departure picker says it, the others' arrival clock time from the
 * nav log, a dash with no airplane. Past four points the middle ones fold
 * into "N more stops", the next stop always shown. A Direct To's first
 * line is "My Location"; a point the planner does not know is its
 * line in red with why. The card is one disclosure: a tap anywhere but an
 * ident (or its chevron) opens the route into its cards on the same rail.
 */
export default function RouteTimeline({
  vm,
  onOpen,
}: {
  vm: PlanSlices<"brief" | "cards" | "leg" | "plan" | "route" | "routeList">;
  onOpen: () => void;
}) {
  const { depart, fuelParam, planned } = vm.route;
  const { aircraft, course, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { routeRows } = vm.leg;
  const { metarCategory } = vm.brief;
  const { waypointStops } = vm.routeList;
  // The airports (and a present position) in order; the waypoints flown
  // through are the cards' to show.
  const stops = planned.stops.filter((stop) => !waypointStops.has(stop));
  const points: Line[] = [
    { kind: "point", ident: planned.dep, role: "dep" },
    ...stops.map((ident) => ({ kind: "point" as const, ident, role: "stop" as const })),
    { kind: "point", ident: planned.dest, role: "dest" },
  ];
  const lines: Line[] =
    points.length > MOST_LINES ? [points[0]!, points[1]!, { kind: "more", count: points.length - 3 }, points.at(-1)!] : points;
  const fuel = (fuelParam ?? "").split(",").filter(Boolean);
  // Each field's card, asked once and shared with the route's colours
  // (useFieldColours) and its cards: its city.
  const fields = points.flatMap((p) => (p.kind === "point" && identOf(p.ident) ? [p.ident] : []));
  const cards = useQueries({ queries: fields.map((ident) => ({ ...airportQuery(ident), staleTime: 10 * 60_000 })) });
  const cityOf = (ident: string) => cards[fields.indexOf(ident)]?.data?.municipality || null;
  const nameOf = (ident: string, role: "dep" | "stop" | "dest") => {
    if (!course || isPosition(ident)) return null;
    const field =
      role === "dep" ? course.departure : role === "dest" ? course.destination : course.stops?.find((f) => sameField(f.ident, ident));
    return field ? placeName(field.name, field.ident) : null;
  };
  // Its time: the departure's leave time, the others' arrival from the
  // nav log's rows; a dash with no airplane, as the strip has.
  const timeOf = (ident: string, role: "dep" | "stop" | "dest") => {
    if (role === "dep") return depart ? leaveWhen(new Date(depart)) : "Now";
    if (aircraft.none) return "—";
    const row = routeRows.find(
      (r) =>
        (r.kind === "stop" || r.kind === "destination") && (role === "dest" ? r.kind === "destination" : sameField(r.airport.ident, ident)),
    );
    return row ? etaAt(depart || new Date().toISOString(), row.minutesFlown) : "—";
  };
  const via = stops.length ? ` via ${stops.map(pointName).join(", ")}` : "";
  return (
    <div className={cn("relative rounded-(--radius-banner) px-3 py-1", PANEL_FIELD_FILL)} data-testid="route-summary">
      {/* The disclosure over the whole card, under the idents' links. */}
      <BaseButton
        onClick={onOpen}
        aria-expanded={false}
        aria-label={`Route ${pointName(planned.dep)} to ${pointName(planned.dest)}${via}, open`}
        data-route-toggle=""
        data-testid="route-summary-open"
        className="absolute inset-0 rounded-(--radius-banner) outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <ol className="pointer-events-none relative" aria-label="The route">
        {lines.map((line, i) => {
          const last = i === lines.length - 1;
          const rail = (
            <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center self-stretch">
              {!last && <span className="absolute top-1/2 -bottom-1/2 w-0.75" style={{ backgroundColor: COURSE }} />}
              <span className="relative mt-auto mb-auto size-3 rounded-full border-[3px] bg-(--sheet)" style={{ borderColor: COURSE }} />
            </span>
          );
          if (line.kind === "more")
            return (
              <li key="more" className="pointer-events-none flex h-11 items-center gap-2" data-testid="timeline-more">
                {rail}
                <span className={cn("text-muted-foreground", TEXT.note)}>
                  {line.count} more {line.count === 1 ? "stop" : "stops"}
                </span>
              </li>
            );
          const { ident, role } = line;
          const unknown = s.unknownPlace?.ident && sameField(s.unknownPlace.ident, ident) ? s.unknownPlace : null;
          const category = unknown ? null : metarCategory(ident);
          const name = nameOf(ident, role);
          const shown = unknown ? unknownWhy(unknown) : (cityOf(ident) ?? name);
          const isFuel = role === "stop" && fuel.some((f) => sameField(f, ident));
          const field = !isPosition(ident) && !!identOf(ident);
          return (
            <li
              key={`${role}:${ident}:${i}`}
              className="pointer-events-none flex h-11 min-w-0 items-center gap-2"
              data-testid="timeline-line"
            >
              {rail}
              {field && !unknown ? (
                <Button
                  variant="link"
                  size="inline"
                  onClick={() => selectPlace(ident)}
                  aria-label={`${ident}: open the airport`}
                  data-testid="timeline-ident"
                  className={cn(
                    "pointer-events-auto relative z-10 shrink-0 font-semibold after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']",
                    TEXT.detail,
                  )}
                >
                  {ident}
                </Button>
              ) : (
                <span className={cn("shrink-0 font-semibold", unknown && "text-destructive", TEXT.detail)}>{pointName(ident)}</span>
              )}
              {category && <StatusBadge category={category} className="shrink-0" />}
              <span
                className={cn("min-w-0 flex-1 truncate", unknown ? "text-destructive" : "text-muted-foreground", TEXT.note)}
                data-testid="timeline-name"
              >
                {/* The city seen; the airport's name said after it. */}
                <span aria-hidden={!unknown && shown !== name ? true : undefined}>{shown}</span>
                {!unknown && name && shown !== name && <span className="sr-only">{name}</span>}
              </span>
              {/* A fuel stop's pump, the route cards' own (FieldHead), in the tint. */}
              {isFuel && (
                <span
                  className="grid size-4 shrink-0 place-items-center rounded-full bg-tint text-primary-foreground"
                  data-testid="timeline-fuel"
                >
                  <Fuel className="size-2.5" strokeWidth={2.6} aria-label="fuel stop" role="img" />
                </span>
              )}
              <span className={cn("shrink-0 font-semibold tabular-nums", TEXT.detail)} data-testid="timeline-time">
                {timeOf(ident, role)}
              </span>
              <span className="w-5 shrink-0" aria-hidden="true">
                {i === 0 && <ChevronDown className="size-5 text-tint" />}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
