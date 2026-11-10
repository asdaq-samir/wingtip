import { useEffect, useRef } from "react";
import { toast } from "../../../lib/toast";
import { clearProblem, raiseProblem } from "../../../lib/problems";
import type { Course } from "../../../lib/api/types";
import { usePreferences } from "../../../lib/preferences";
import { keepKey, keepingAvailable, keptAlready, stopKeeping, useKeepJob } from "../../../lib/map/route/keepRoute";
import { keepForAir, keptRecordStore } from "../../keptForAir";
import { chartPair } from "../../../lib/map/sources/tiles";
import { grouped } from "../../../lib/format";

/**
 * Keep for the Air, a setting under Map: while it is on, each route
 * the planner loads is kept for the air (keepForAir: its briefing, NOTAMs,
 * airport cards, plates, plan and weather loop, then its base chart) --
 * once, not again while the tiles are held -- and turning it off stops a
 * keep under way. It was an item in More beside the route, pressed per route.
 */
export function useKeepOffline(course: Course | null) {
  const on = usePreferences((s) => s.keepOffline);
  const base = usePreferences((s) => s.base);
  useEffect(() => {
    if (!on) {
      stopKeeping();
      return;
    }
    if (!course || !keepingAvailable()) return;
    const layer = chartPair(course.chart_layers, base).base;
    if (!layer) return;
    const key = keepKey(course, layer.kind);
    const job = useKeepJob.getState();
    if ((job.status === "keeping" || job.status === "kept") && job.key === key) return;
    if (keptAlready(key)) return;
    void keepForAir(course, layer);
  }, [on, course, base]);
  useKeepRouteToast();
}

const TOAST_ID = "keep-route";

/** How a keep goes, as a toast that updates in place: the tiles counted
 *  while it fetches, then kept or not. Only a keep that runs while this
 *  is mounted is told: an old one's result is not news. */
export function useKeepRouteToast() {
  const job = useKeepJob();
  const was = useRef(job.status);
  useEffect(() => {
    const before = was.current;
    was.current = job.status;
    if (job.status === "keeping") {
      clearProblem(TOAST_ID);
      toast.add({
        id: TOAST_ID,
        title: "Saving Charts Offline",
        type: "loading",
        // Up until the keep is done.
        timeout: 0,
        description: job.progress ? `${grouped(job.progress.done)} of ${grouped(job.progress.total)}` : undefined,
      });
    } else if (before === "keeping" && job.status === "kept") {
      const { total, failed } = job.progress;
      if (failed >= total) {
        toast.close(TOAST_ID);
        raiseProblem({ id: TOAST_ID, title: "Charts not kept: none of the tiles could be fetched" });
      } else {
        // The route's answers kept with them, and their size (keptForAir).
        const answers = keptRecordStore().getState().value;
        toast.add({
          id: TOAST_ID,
          title: "Charts Saved Offline",
          type: "success",
          timeout: 2000,
          description: answers ? `With the briefing, NOTAMs and plates: ${megabytes(answers.bytes)}` : undefined,
        });
        // The tiles that could not be fetched are a problem, said where
        // problems are (lib/problems) and kept until the next keep, not a
        // bracket inside the news that it worked.
        if (failed)
          raiseProblem({ id: TOAST_ID, title: `${grouped(failed)} chart tiles not kept: those parts of the route need a connection` });
      }
    } else if (before === "keeping" && job.status === "failed") {
      toast.close(TOAST_ID);
      raiseProblem({ id: TOAST_ID, title: `Charts not kept: ${job.detail}` });
    } else if (job.status === "idle") {
      // Stopped, or the setting turned off: a failure said is gone too.
      if (before === "keeping") toast.close(TOAST_ID);
      clearProblem(TOAST_ID);
    }
  }, [job]);
}

/** A size as the toast says it: "3 MB", "0.4 MB". */
function megabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb >= 1 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
}
