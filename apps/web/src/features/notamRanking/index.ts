/** The NOTAMs that matter, ranked for the flight: Preflight's section and
 *  the Brief's row that opens it, the feature's entries. */
export { default as NotamRankingSection, NotamsRow } from "./NotamRankingLazy";
/** Its query, for what reads when the NOTAMs were fetched (Ready to fly). */
export { notamRankingQuery } from "./useNotamRanking";
