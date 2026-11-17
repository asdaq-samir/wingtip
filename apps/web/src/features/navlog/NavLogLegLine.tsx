import { cn } from "cn";
import { windAloft, bearing } from "../plan";
import type { Leg } from "../../lib/api/types";
import { gal, magneticVariation, windCorrection } from "../../lib/format";
import { TEXT } from "../../lib/text";
import Explain from "../../components/Explain";
import { EXPLAINED, type ExplainedTerm } from "../../lib/explain";
import LegWorkings from "./LegWorkings";
import type { Phase } from "./workings";
import DiversionDrill from "./DiversionDrill";
import { tas } from "./navLogColumns";

/** The leg's figures the drawer's table has no columns for, under the
 *  selected row -- on a desktop as on a phone, the pilot's preference for
 *  the compact log (every column is the printed page's alone, see the
 *  column defs): the heading worked out from the course -- true course, wind,
 *  correction, true heading, variation (the magnetic heading it ends in
 *  is the row's own) -- then the speeds and the fuel, in the nav log's
 *  own order. A grid of figures four across, each its shorthand over
 *  its value at the rows' own size; it was a run of "TC 327° Wind
 *  220°/28 WCA ..." breaking wherever the line ran out. (Their whole
 *  names were tried, two across, and the pilot kept the shorthand.) */
export function LegLine({ leg, at, phase }: { leg: Leg; at: { name: string; lat: number; lon: number }; phase: Phase }) {
  const figures: [string, string][] = [
    ["TC", bearing(leg.true_course_deg)],
    ["Wind", leg.wind ? windAloft(leg.wind.wind_dir_true_deg, leg.wind.wind_speed_kt) : "no data"],
    ["WCA", leg.wca_deg != null ? windCorrection(leg.wca_deg) : "—"],
    ["TH", leg.true_heading_deg != null ? bearing(leg.true_heading_deg) : "—"],
    ["Var", magneticVariation(leg.magnetic_variation_deg)],
    ["TAS", tas(leg)],
    ["GS", leg.groundspeed_kt === null ? "—" : String(Math.round(leg.groundspeed_kt))],
    ["Fuel", gal(leg.fuel_gal)],
  ];
  return (
    // mb-5: the links' 44-point hit areas (index.css) reach 11 below them,
    // and the checkpoint's note's own tap band (DescriptionCell's label) 9
    // above it -- 20 between them, so neither takes the other's taps.
    <div className="mb-5 space-y-1 print:hidden">
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-x-2 gap-y-1">
        {figures.map(([name, value]) => (
          <div key={name}>
            {/* The shorthand a tap for its meaning where it has one (Explain). */}
            <dt className={TEXT.note}>{name in EXPLAINED ? <Explain term={name as ExplainedTerm} /> : name}</dt>
            <dd className={cn("text-foreground tabular-nums", TEXT.detail)}>{value}</dd>
          </div>
        ))}
      </dl>
      {/* The same figures worked out, for a student to follow or try;
          and a diversion from the row's point, against the clock. Where
          the two wrap (a 320 pt slide-over) each link's 44 pt hit area
          reaches 11 pt past its 22 pt line, so the lines sit 22 pt apart
          for the areas to meet rather than overlap. */}
      <div className="flex flex-wrap gap-x-4 gap-y-5.5">
        <LegWorkings leg={leg} phase={phase} />
        <DiversionDrill leg={leg} at={at} />
      </div>
    </div>
  );
}
