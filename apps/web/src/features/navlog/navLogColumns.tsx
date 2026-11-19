import type { CellData, ColumnDef, RowData, TableFeatures } from "@tanstack/react-table";
import { tableFeatures } from "@tanstack/react-table";
import { altFt, bearing, etaAt, flownNmOf, isLegPoint, legOf, one, rowPoint, windAloft, type NavLogRow } from "../plan";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import { magneticVariation, windCorrection } from "../../lib/format";
import { PointMark } from "./PointMark";
import { Heading } from "./ColumnHeading";
import FigureWait from "../../components/FigureWait";

// TanStack Table's own extension point for arbitrary per-column data --
// used below to carry each numeric column's shared className (bordered,
// right-aligned) instead of repeating it on every column definition's own `cell`/`header`, the same way `meta` is meant to be used.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match the real ColumnMeta's own type params for the module augmentation to merge
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue extends CellData = CellData> {
    className?: string;
  }
}

// No sorting/filtering/pagination/selection/visibility -- a nav log's
// own row order IS its meaning (waypoints in the order a pilot
// actually flies them), so this table opts into none of TanStack
// Table's v9 feature modules; `tableFeatures({})` is its own
// documented way to say "just the core row/column/header model," not
// a placeholder waiting to be filled in.
export const navLogTableFeatures = tableFeatures({});

/** A column on paper alone: a phone has the leg's figures under its row. */
const PAPER = { className: "hidden print:table-cell" };
/** A desktop's side panel's columns (docs/design/web.md §4: Point, Alt,
 *  TC, Wind, MH, Dist, GS, ETE, Fuel, and the ETA with a departure time);
 *  the rest are the leg's grid under its row, as on a phone. */
const DESK = new Set(["waypoint", "alt", "dist", "tc", "wind", "mh", "gs", "ete", "fuel", "eta"]);
/** The columns only an airplane gives (decision 0011: none assumed): its
 *  heading, groundspeed, time and fuel, which need its airspeed and burn. */
const AIRPLANE = new Set(["mh", "gs", "ete", "fuel"]);

/** The leg's true airspeed, in its own air (the engine's
 *  wingtip_flight::performance): it varies with the altitude and the forecast
 *  temperature, so each leg has its own. A dash from a planner that did
 *  not say. */
export function tas(leg: Leg): string {
  return leg.tas_kt == null ? "—" : String(Math.round(leg.tas_kt));
}

/** A column's own class: the paper's alone columns keep their `hidden print:table-cell`
 *  except on a desktop's side panel, where they are not drawn at all. */
export const columnClass = (meta: { className?: string } | undefined, onDesk: boolean) =>
  onDesk && meta === PAPER ? undefined : meta?.className;

/** The nav log table's columns: the waypoint, altitude, distance, magnetic
 *  heading and ETE on screen, every one on paper, and a desktop's own set. */
export function navLogColumns({
  nav,
  depart,
  numbers,
  metarColourOf,
  onDesk,
  airplane,
}: {
  nav: NavLogAltitude | null;
  depart: string;
  /** Each checkpoint's number, as its dot on the map has it. */
  numbers: Map<string, number>;
  metarColourOf: (ident: string) => string | undefined;
  onDesk: boolean;
  airplane: boolean;
}): ColumnDef<typeof navLogTableFeatures, NavLogRow>[] {
  // How the altitude was chosen -- the four plans, the pilot's own, and
  // why: a pilot should never have to take a cruise altitude on trust,
  // so the Alt column's own heading opens the planner's reasoning (floor,
  // ceiling, the rule, the weather checked) rather than a bare "(auto)".
  // The briefing's Cruise Altitude section carries the same steps onto
  // the paper.
  // On screen the table keeps five columns -- the waypoint, altitude,
  // distance, magnetic heading and ETE (and the ETA with a departure
  // time) -- and the others, which had it fourteen wide and scrolling
  // sideways, are the leg's figures under the selected row instead (see
  // LegLine). A desktop's drawer too, by the pilot's preference for the
  // phone's compact log: from md up it had every column, three of them in
  // view and the rest off its edge. On paper, every column. The heading
  // kept is the one a pilot steers: it was the true heading, with the
  // magnetic one only under the row.
  const columns: ColumnDef<typeof navLogTableFeatures, NavLogRow>[] = [
    {
      id: "waypoint",
      header: () => <span className="inline-flex items-center">Waypoint</span>,
      // The name after the point's mark as the map draws it (PointMark):
      // a checkpoint's numbered dot, an airport's symbol, a top of climb's
      // tag. No more: a leg the clouds leave no legal altitude on is the
      // briefing's to say (Current Conditions, the Cruise Altitude
      // reasoning), not a red mark by the waypoint, which the pilot found
      // one warning too many.
      cell: ({ row }) => (
        <span className="flex min-w-[5.5rem] items-center gap-2 lg:pointer-fine:min-w-[4.5rem]">
          <PointMark
            row={row.original}
            number={row.original.kind === "checkpoint" ? numbers.get(row.original.key) : undefined}
            weather={metarColourOf}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{rowPoint(row.original).name}</span>
        </span>
      ),
      // On a phone a name wraps, and a long word is hyphenated rather
      // than pushing the figures off the drawer's edge: with a
      // departure time's ETA as a sixth column, "Subdivision" alone was
      // wider than the room left. At a syllable where the browser can
      // hyphenate; where it cannot (no dictionary: CI's audit found the
      // log seven points past an iPhone 16 Pro's panel for "Meadowbrook"
      // at 10,500 ft), broken at the column's edge as a last resort. The
      // column is never narrower than 5.5 rem, its mark and some ten
      // letters: broken anywhere with no floor, the table squeezed it, and
      // a name went "Clyma / n / Subdiv / ision".
      meta: { className: "text-left whitespace-normal hyphens-auto" },
    },
    {
      id: "alt",
      // How its altitudes were chosen opens from the altitude's own chip
      // beside the airplane (AltitudeGroup), at the pilot's ask: it was
      // this column's head, out of sight with the panel down.
      header: () => <Heading name="Alt" unit="ft" spoken="Altitude, feet" />,
      // The last row lands at the destination -- shows its field
      // elevation, known immediately, rather than a cruise altitude.
      // A checkpoint's row shows the altitude of the leg that arrives
      // at it -- a plan may step, so each leg carries its own -- and
      // the plan's first altitude until that leg streams in.
      cell: ({ row }) => {
        const r = row.original;
        // A top of climb its level; a top of descent the level it leaves.
        if (isLegPoint(r)) return altFt(r.point.altitude_ft);
        // A waypoint flown through, as a checkpoint: the leg's altitude.
        const flownThrough = r.kind === "checkpoint" || (r.kind === "stop" && r.airport.kind === "fix");
        return altFt(flownThrough ? (r.leg?.altitude_ft ?? nav?.altitude_ft) : r.airport.elevation_ft);
      },
    },
    {
      id: "dist",
      header: () => <Heading name="Dist" unit="nm" spoken="Distance, nautical miles" />,
      // With a procedure's miles where the leg ends (rows' procedureOf).
      cell: ({ row }) => (legOf(row.original) ? one(flownNmOf(row.original)!) : <FigureWait />),
    },
    {
      id: "tc",
      header: () => <Heading name="TC" unit="true" spoken="True course" />,
      meta: PAPER,
      cell: ({ row }) => (legOf(row.original) ? bearing(legOf(row.original)!.true_course_deg) : <FigureWait />),
    },
    {
      id: "wind",
      header: () => <Heading name="Wind" unit="°/kt" spoken="Wind, direction and speed" />,
      meta: PAPER,
      cell: ({ row }) => {
        const leg = legOf(row.original);
        return leg ? leg.wind ? windAloft(leg.wind.wind_dir_true_deg, leg.wind.wind_speed_kt) : "no data" : <FigureWait />;
      },
    },
    {
      id: "wca",
      header: () => <Heading name="WCA" unit="°" spoken="Wind correction angle" />,
      meta: PAPER,
      cell: ({ row }) => (legOf(row.original)?.wca_deg != null ? windCorrection(legOf(row.original)!.wca_deg!) : "—"),
    },
    {
      id: "th",
      header: () => <Heading name="TH" unit="true" spoken="True heading" />,
      meta: PAPER,
      cell: ({ row }) => (legOf(row.original)?.true_heading_deg != null ? bearing(legOf(row.original)!.true_heading_deg!) : "—"),
    },
    {
      id: "var",
      header: () => <Heading name="Var" unit="°" spoken="Magnetic variation" />,
      meta: PAPER,
      cell: ({ row }) => (legOf(row.original) ? magneticVariation(legOf(row.original)!.magnetic_variation_deg) : <FigureWait />),
    },
    {
      id: "mh",
      header: () => <Heading name="MH" unit="mag" spoken="Magnetic heading" />,
      cell: ({ row }) => (legOf(row.original)?.magnetic_heading_deg != null ? bearing(legOf(row.original)!.magnetic_heading_deg!) : "—"),
    },
    {
      // Each leg's own: the airplane's cruise in the forecast air at the
      // leg's altitude, which is why it is a column (the altitude's
      // reasoning says how it is worked out).
      id: "tas",
      header: () => <Heading name="TAS" unit="kt" spoken="True airspeed, knots" />,
      meta: PAPER,
      cell: ({ row }) => {
        const leg = legOf(row.original);
        return leg ? tas(leg) : <FigureWait />;
      },
    },
    {
      id: "gs",
      header: () => <Heading name="GS" unit="kt" spoken="Groundspeed, knots" />,
      meta: PAPER,
      cell: ({ row }) => {
        const leg = legOf(row.original);
        return leg ? leg.groundspeed_kt === null ? "—" : Math.round(leg.groundspeed_kt) : <FigureWait />;
      },
    },
    {
      id: "ete",
      header: () => <Heading name="ETE" unit="min" spoken="Time en route, minutes" />,
      cell: ({ row }) => {
        const leg = legOf(row.original);
        return leg ? leg.ete_min === null ? "unflyable" : one(leg.ete_min) : <FigureWait />;
      },
    },
    {
      id: "fuel",
      header: () => <Heading name="Fuel" unit="gal" spoken="Fuel, gallons" />,
      meta: PAPER,
      cell: ({ row }) => (legOf(row.original) ? one(legOf(row.original)!.fuel_gal) : <FigureWait />),
    },
  ];
  // With a departure time, every row gets its ETA: the departure's own
  // time, then the time each leg ends -- "—" from the first leg that is
  // not in yet or cannot be flown (see navLogRows).
  const etaColumn: ColumnDef<typeof navLogTableFeatures, NavLogRow> = {
    id: "eta",
    header: () => <Heading name="ETA" unit="local" spoken="Arrival time, local" />,
    cell: ({ row }) => etaAt(depart, row.original.minutesFlown),
  };
  if (depart) columns.push(etaColumn);
  // On paper only: the two columns a pilot fills in by hand in flight,
  // the actual time over each fix and the fuel left -- what makes the
  // printed page a nav log to fly with rather than a table to read.
  for (const [id, name, unit, spoken] of [
    ["ata", "ATA", "local", "Actual arrival time"],
    ["fuel_rem", "Fuel rem.", "gal", "Fuel remaining, gallons"],
  ] as const) {
    columns.push({
      id,
      header: () => <Heading name={name} unit={unit} spoken={spoken} />,
      cell: () => "",
      meta: { className: "hidden w-14 border-l border-border print:table-cell" },
    });
  }
  // No sorting/filtering/pagination -- a nav log's own row order IS
  // its meaning (waypoints in the order a pilot actually flies them),
  // and `navLogTableFeatures`'s own core model is the only row model
  // this needs; a sortable column here would let a pilot reorder the
  // log into something unflyable (e.g. by Fuel).
  // A desktop's columns: the desk's, and those an airplane gives only with
  // one picked (NavLogList's rule on a phone, TripFigures' on the strip).
  return onDesk ? columns.filter((c) => DESK.has(c.id ?? "") && (airplane || !AIRPLANE.has(c.id ?? ""))) : columns;
}
