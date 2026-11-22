import { notamNone } from "../../lib/notamCoverage";
import { useNotamMarks } from "./notamMarks";
import { arrangeNotams } from "./notamView";
import { useNotamRanking } from "./useNotamRanking";

/**
 * The NOTAMs as the pilot has them arranged (filtered, sorted, pinned and
 * read: notamView), with how many there are in words -- "3 that matter, 44
 * more" -- for both the Brief's NOTAMs row and the section it opens on
 * Preflight, so the two say the same.
 */
export function useArrangedNotams() {
  const ranking = useNotamRanking();
  const filter = useNotamMarks((s) => s.filter);
  const sort = useNotamMarks((s) => s.sort);
  const pinned = useNotamMarks((s) => s.pinned);
  const read = useNotamMarks((s) => s.read);
  const all = ranking.answer?.notams ?? [];
  const arranged = arrangeNotams(all, filter, sort, { pinned, read });
  const since = ranking.answer?.coverage_since;
  const full = ranking.answer?.full_set ?? false;
  const count = ranking.pending
    ? "Ranking…"
    : all.length === 0
      ? notamNone(since, full)
      : `${arranged.top.length} that matter${arranged.rest.length ? `, ${arranged.rest.length} more` : ""}`;
  return { ...ranking, ...arranged, all, since, full, count };
}
