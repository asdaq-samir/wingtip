import type { ChartInfo, Leg, Totals } from "../../lib/api/types";
import type { StripFuelAnswer } from "../../lib/engine/contract";
import { tileTemplate } from "../../lib/map/sources/tiles";

/**
 * What the connector's tools answer the live view (the planner's
 * app/mcp/flight_view.py, its structured content): the flight being
 * planned, as the next tool takes it, and what is drawn of its plan.
 * The plan's figures are the planner's and the engine's; nothing here
 * works one out (CLAUDE.md, the engine owns every rule): the view runs
 * no engine, its host's sandbox loading no WebAssembly, so the strip's
 * fuel comes worked out too (strip_fuel).
 */
export interface Flight {
  departure: string;
  destination: string;
  stops?: string[];
  fuel_stops?: string[];
  cruise_altitude_ft?: number | null;
  depart_at?: string | null;
  procedures?: string;
  fuel_on_board?: Record<string, number>;
  airplane_tail?: string | null;
  rules?: "vfr" | "ifr";
  saved_flight_id?: number | null;
}

export interface ViewPoint {
  ident: string;
  name: string | null;
  lat: number;
  lon: number;
  role: "departure" | "stop" | "destination";
  field: boolean;
  fuel_stop: boolean;
}

export interface ViewApproach {
  airport: string;
  id: string;
  name: string;
  transition: string | null;
  state: string;
  loaded: boolean;
  missed: boolean;
}

export interface FlightView {
  /** The server's order of its answers: the newest view keeps the say. */
  seq: number;
  created_at: number;
  /** Wingtip's own address, which the chart's tiles come from. */
  origin: string | null;
  points: ViewPoint[];
  line: [number, number][];
  legs: Leg[];
  totals: Totals;
  /** The engine's strip_fuel answer, as the planner asked it. */
  strip_fuel: StripFuelAnswer;
  altitude_ft: number;
  approaches: ViewApproach[];
  airplane: string | null;
  chart: Pick<ChartInfo, "chart_cycle" | "chart_revision" | "chart_tiles_base" | "chart_layers" | "max_zoom" | "min_zoom">;
  open_in_wingtip: string | null;
}

export interface Answer {
  flight: Flight;
  view: FlightView;
}

/** A tool's structured content as the view's answer, or null where it is
 *  not one (an answer of another tool, an error's). */
export function answerOf(structured: unknown): Answer | null {
  const a = structured as Partial<Answer> | null | undefined;
  return a?.flight?.departure && a.view?.points?.length ? (a as Answer) : null;
}

/** Which of two answers is the newer, by the server's own order. */
export const newer = (a: FlightView, b: FlightView) => a.created_at > b.created_at || (a.created_at === b.created_at && a.seq > b.seq);

/** The sectional's tiles at Wingtip's own address: through the gateway,
 *  or the CDN's where the chart is published there. */
export function chartTiles(view: FlightView): string | null {
  if (!view.chart.chart_layers.length) return null;
  const template = tileTemplate(view.chart as ChartInfo, "sec");
  return template.startsWith("/") ? (view.origin ? `${view.origin}${template}` : null) : template;
}

/** The minutes en route to each point, the legs' own times added up in
 *  their order (none where the plan has no airplane): the departure
 *  none, each later point its first leg in. */
export function minutesTo(view: FlightView): (number | null)[] {
  let flown = 0;
  let at = 1;
  const out: (number | null)[] = view.points.map(() => null);
  for (const leg of view.legs) {
    if (leg.ete_min == null) return out.map(() => null);
    flown += leg.ete_min;
    const point = view.points[at];
    if (point && leg.to === point.ident) {
      out[at] = flown;
      at += 1;
    }
  }
  return out;
}

/** What a tap in the view asks of the connector: a tool and its
 *  arguments besides the flight, and what it did, in words for the model. */
export interface Change {
  tool: string;
  args: Record<string, unknown>;
  said: string;
}

/** The changes an approach offers where it is: loaded, Activate; active,
 *  Deactivate and its missed approach's; Remove either way. */
export function approachChanges(a: ViewApproach): (Change & { label: string })[] {
  const step = (action: string, label: string, said: string) => ({
    tool: "change_approach",
    args: { airport: a.airport, action },
    label,
    said: `${said} the ${a.name} at ${a.airport}`,
  });
  return [
    a.loaded ? step("activate", "Activate", "activated") : step("deactivate", "Deactivate", "deactivated"),
    ...(a.loaded
      ? []
      : [
          a.missed
            ? step("suspend_missed", "Suspend Missed", "suspended the missed approach of")
            : step("unsuspend_missed", "Unsuspend Missed", "unsuspended the missed approach of"),
        ]),
    step("remove", "Remove", "removed"),
  ];
}

/** Saving: over the saved flight it came from, or as a new one. */
export function saveChange(flight: Flight): Change & { label: string } {
  return flight.saved_flight_id
    ? {
        tool: "update_saved_flight",
        args: {},
        label: "Update Saved",
        said: `saved the changes over saved flight ${flight.saved_flight_id}`,
      }
    : { tool: "save_flight_plan", args: {}, label: "Save", said: "saved the flight to their Wingtip account" };
}
