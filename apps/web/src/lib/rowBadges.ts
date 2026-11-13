import { BADGE } from "./tokens";

/** The badges' colours, by what a row is about: one per kind, the same
 *  on every card and on the phones (design/tokens.json color.badge). Not
 *  the weather's colours (lib/map/marks/flightCategory), so a badge is
 *  never read as a flight category. */
export { BADGE };

/** The consoles' rows -- the settings, the Personal tab's pages -- each
 *  in a colour of its own, as iOS's Settings leads every row with one,
 *  from the same palette as the cards'. */
export const SETTING_BADGE = {
  aircraft: BADGE.tower,
  flights: BADGE.ground,
  logbook: BADGE.traffic,
  minimums: BADGE.hazard,
  checklists: BADGE.approach,
  coach: BADGE.weather,
  practice: BADGE.chart,
  emergency: BADGE.hazard,
  subscription: BADGE.food,
  settings: BADGE.other,
  tips: BADGE.lights,
  about: BADGE.other,
} as const;
