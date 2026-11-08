/**
 * Whose winds aloft the app shows, in one place for every screen that
 * shows them: the nav log, the Brief, the altitude reasoning, the map's
 * wind barbs and the developer console.
 *
 * Every wind aloft is model output since the Winds and Temperatures Aloft
 * Forecast (FB) ended: NWS Service Change Notice 26-47 discontinued the
 * NAM, and with it the FB bulletins, at 1200Z on 3 November 2026. The
 * planner reads the NOAA/NCEP Global Forecast System (GFS, 0.25 degree)
 * instead (services/planner/wingtip/modelwinds.py), unedited by a
 * forecaster, so each screen says the winds are modelled and by which
 * model, beside the figure.
 */

/** The model the winds aloft come from: NOAA/NCEP's GFS. */
export const WINDS_MODEL = "GFS";

/** Beside a wind aloft or its heading: "modelled (GFS)". */
export const WINDS_MODELLED = `modelled (${WINDS_MODEL})`;

/** The same at the start of a label: "Modelled (GFS)". */
export const WINDS_MODELLED_LABEL = `Modelled (${WINDS_MODEL})`;

/** The nav log's words for the winds a plan flies, with the GFS run and
 *  forecast hour where the planner gives them (`run`, " 12Z +6 h"):
 *  "modelled winds (GFS 12Z +6 h)". */
export function modelledWinds(run = ""): string {
  return `modelled winds (${WINDS_MODEL}${run})`;
}
