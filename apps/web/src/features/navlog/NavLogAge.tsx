import { cn } from "cn";
import LiveAge from "../../components/LiveAge";
import { useLatestAnswer } from "../../lib/kept/latest";
import { TEXT } from "../../lib/text";

/** The nav log's age over its lines, always (the FPL redesign, the owner
 *  2026-11-17: every live figure says its age where it is read): its winds
 *  aloft are the forecast the log was planned on, as old as the log. The
 *  newest log the page holds, the one on screen, judged by the engine's
 *  `kept_age` for a plan, greyed once stale, and "offline" while the
 *  browser has no network. */
export default function NavLogAge() {
  const latest = useLatestAnswer(["navlog"]);
  if (!latest) return null;
  return (
    <p className={cn("pl-1.5 text-muted-foreground", TEXT.note)} data-testid="navlog-age">
      Winds aloft <LiveAge at={latest.atMs} what={{ kept: "plan" }} />
    </p>
  );
}
