import type { ReactNode } from "react";
import { type PanelTab, type Description, type BriefingPart, type RouteEnds, type DryRun } from "../plan";
import type { Candidate, Leg, NavLogAltitude, Totals } from "../../lib/api/types";

export interface NavLogViewProps {
  totals: Totals | null;
  nav: NavLogAltitude | null;
  /** The departure time as an ISO instant, or "" for about now --
   *  set here, where its ETAs show; changing it re-plans, since the
   *  winds forecast period follows it. */
  depart: string;
  /** The airplane the log is computed for, by name -- chosen in the
   *  panel's controls (FlightInputs), named here on paper. */
  aircraftLabel: string;
  /** Streamed in one at a time, in the same order as `selected` --
   *  `legs[i]` is the leg that arrives at `selected[i]`, one short of
   *  `selected.length + 1` until the final leg (to the destination)
   *  streams in. A row is drawn for every waypoint in `selected` and
   *  the destination regardless of how many legs have arrived yet --
   *  the ones without a leg show placeholders rather than waiting. */
  legs: Leg[];
  dep: string;
  dest: string;
  /** The course's two airports -- where the first and last rows are,
   *  their field elevations (the Alt column's first and last rows: the
   *  aircraft starts and lands there, not at a cruise altitude) and
   *  their full names (shown under each, the same spot a checkpoint's
   *  note sits, never editable). null until the course is known, and
   *  then there are no rows at all. */
  ends: RouteEnds | null;
  /** In the same order as `legs` -- the checkpoint leg `i` arrives at
   *  is `selected[i]`, matching how PlanWorkspace already builds the leg
   *  list itself (fixes = [departure, ...selected, destination]). */
  selected: Candidate[];
  descriptions: Record<string, Description>;
  /** Resolves once the note is saved; the box keeps a pilot's typing
   *  until then, and keeps it if the save fails. */
  onSaveDescription: (lat: number, lon: number, text: string) => Promise<unknown>;
  /** The briefing's pages (FlightBriefingView's parts), printed after the legs: on screen they are the Brief's
   *  card's (BriefCard). */
  tabContent: (part: BriefingPart) => ReactNode;
  /** Beside the log, out of sight: Print's kneeboard card. */
  children?: ReactNode;
  /** Pages whose part has a warning, marked on paper as on the Brief. */
  marks?: Partial<Record<PanelTab, "stop" | "caution">>;
  /** The briefing's warnings, over its pages on paper. */
  notice?: ReactNode;
  /** The Nav Log card's view (PlanPage's; the owner 2026-11-11), its head
   *  over the legs: on screen only, FPL's view is the paper (`paper`). */
  cardHead?: ReactNode;
  /** A local flight, one airport to itself: no legs, so the section is
   *  "Local Flight" -- the time aloft, the time back and the fuel, and
   *  the fuel check -- in place of the nav log. */
  local: boolean;
  /** An airport's weather colour, as its chip on the map: its mark's
   *  middle in the waypoint column (PointMark). */
  metarColourOf: (ident: string) => string | undefined;
  /** Clicking a row focuses that waypoint on the map (pans/zooms to
   *  it, draws the halo) the same way clicking its marker there
   *  selects this row -- keyed by coordinates rather than a row
   *  index, since the map's own marker order and this table's order
   *  are two independent views of the same points. Null while
   *  nothing is selected. */
  selectedPoint: { lat: number; lon: number } | null;
  onSelectPoint: (lat: number, lon: number) => void;
  /** Nothing selected: a tap on the selected row, which closes it. */
  onDeselectPoint: () => void;
  /** Whether the nav log is in sight: the panel all the way up, where
   *  half way it ends at the tabs' bar. The view stays mounted whether or
   *  not it is. */
  drawerOpen: boolean;
  /** The planned flight's dry run while one is up: the log follows it, the
   *  row it is flying to tinted and kept in sight. */
  dryRun: DryRun | null;
  /** FPL's own list in the nav log's place on screen: the route in order
   *  (ProceduresRoute), at the owner's ask ("I want to replace navlog with
   *  procedures", 2026-10-18). The legs are the Nav Log card's, this view
   *  drawn again there without the route (`cardHead`). */
  route?: ReactNode;
}
