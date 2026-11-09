import KeptAge from "../../../../components/KeptAge";
import { useLatestAnswer } from "../../../../lib/kept/latest";

/** The nav log's age over its lines where it is the one kept on this
 *  device (the service worker's, lib/kept), no signal to plan again: the
 *  newest log the page holds, the one on screen. Its winds are the
 *  briefing's, and as fresh. */
export default function NavLogAge() {
  const latest = useLatestAnswer(["navlog"]);
  return <KeptAge kind="plan" path="/api/planner/navlog" atMs={latest?.atMs ?? null} failed={latest?.failed} className="pl-1.5" />;
}
