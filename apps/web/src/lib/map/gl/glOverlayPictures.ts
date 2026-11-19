import { BLUE } from "../../useAirspace";
import { CHART } from "../../tokens";
import type { Stretch } from "./drawSvg";
import { AIRSPACE_INK, SUA_INK, airspaceTab, suaHatch } from "./glStyle";
import { SUA_TAB_PICTURES } from "./glSuaLabels";

/** An overlay picture as the layers name it: its id, its svg, and how it stretches. */
type Picture = [id: string, svg: () => string, stretch?: Stretch];

/** A fix's star, ForeFlight's blue (the owner's screenshot over Lake
 *  Michigan, 2026-11-08), the Class B's. */
const FIX_BLUE = CHART.airspaceBlue;

/** The navaids' pictures: the VOR's hexagon (FAA Aeronautical Chart
 *  User's Guide, Radio Aids to Navigation), a fix's four-point star as
 *  ForeFlight draws an enroute fix over the chart (blue, a white rim:
 *  the owner's screenshot over Lake Michigan, 2026-11-08), a VFR
 *  waypoint's green triangle (the owner's pick, 2026-11-07), and the
 *  VOR's blue ident box, stretched to its ident. */
const NAVAID_PICTURES: Picture[] = [
  [
    "nav|vor",
    () =>
      `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="15,8 11.5,14.06 4.5,14.06 1,8 4.5,1.94 11.5,1.94" fill="${CHART.casing}" stroke="${BLUE}" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="${BLUE}"/></svg>`,
  ],
  [
    "nav|fix",
    () =>
      `<svg width="20" height="20" viewBox="-10 -10 20 20"><path d="M0 -9L2.2 -2.2L9 0L2.2 2.2L0 9L-2.2 2.2L-9 0L-2.2 -2.2Z" fill="${FIX_BLUE}" stroke="${CHART.casing}" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  ],
  [
    "nav|vfr",
    () =>
      `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11.2,10.4 0.8,10.4" fill="${CHART.vfrGreen}" stroke="${CHART.casing}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  ],
  [
    "nav|tag",
    () => `<svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="3" fill="${BLUE}"/></svg>`,
    { inset: 4 },
  ],
];

/** The dark tab an airspace's altitudes sit in, as ForeFlight's: a
 *  rounded box bordered in its class's ink, its corners kept as drawn,
 *  stretched to the text. */
const AIRSPACE_TAB_PICTURES: Picture[] = (["B", "C", "D"] as const).map((c) => [
  airspaceTab(c),
  () =>
    `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="0.75" y="0.75" width="10.5" height="10.5" rx="3" fill="${CHART.tag}" fill-opacity="0.92" stroke="${AIRSPACE_INK[c].colour}" stroke-width="1.5"/></svg>`,
  { inset: 4 },
]);

/** A special-use area's hatch, one tick of it: a short diagonal stroke
 *  in the area's ink on a faint wash of it, repeated along the band
 *  (specialUseLayers' line-pattern), as ForeFlight and the sectional
 *  hatch the inside of the boundary. */
const SUA_PICTURES: Picture[] = (Object.keys(SUA_INK) as (keyof typeof SUA_INK)[])
  .map((ink): Picture => [
    suaHatch(ink),
    () =>
      `<svg width="7" height="10" viewBox="0 0 7 10"><rect width="7" height="10" fill="${SUA_INK[ink]}" fill-opacity="0.14"/><path d="M1.5 9.5L5.5 0.5" stroke="${SUA_INK[ink]}" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.9"/></svg>`,
  ])
  .concat(SUA_TAB_PICTURES); // and their tabs (glSuaLabels)

/** Every shape the overlay layers wear besides the airports' (airportIcons): the stations' badges are
 *  the map's own (lib/map/marks/stationModel). */
export const OVERLAY_PICTURES: Picture[] = [...NAVAID_PICTURES, ...AIRSPACE_TAB_PICTURES, ...SUA_PICTURES];
