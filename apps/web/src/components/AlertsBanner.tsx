import { CircleAlert, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import MapBanner, { BannerButton } from "./MapBanner";
import { BANNER_INK } from "./bannerGlass";
import { acknowledge, alertTitle, alertWhen, alertWhere, useAhead } from "../lib/map/position/ahead";
import { useSpokenAlerts } from "./speak";
import { useFeelOnNew } from "../lib/haptics";
import { saaWords } from "../lib/liveReports";

/**
 * What is ahead of own ship in the air (lib/map/position/ahead), over the map
 * where the pilot looks, above the system's problems: the first thing
 * ahead -- a warning before a caution, then the soonest -- with when and
 * how far, and how many more; a tap on the words opens all of them with
 * what each asks (the rule's section with it), and OK puts them away
 * until each has gone from ahead and comes back. Nothing on the ground.
 * Where the planner cannot say, that is said, in its place: a sky with
 * no alerts must not read as a clear one.
 */
export default function AlertsBanner() {
  const ahead = useAhead();
  // Said aloud too, where the pilot has asked for it.
  useSpokenAlerts(ahead);
  // And felt, as a new one comes up first (lib/haptics).
  useFeelOnNew(ahead?.alerts[0]?.id, "warning");
  if (!ahead) return null;
  const { alerts, unavailable, failed } = ahead;
  if (!alerts.length && !failed && !unavailable.length) return null;
  const first = alerts[0];
  const level = first?.level ?? "caution";
  const unread = failed ? "No alerts ahead: the planner did not answer" : `Not read for alerts: ${unavailable.join(", ")}`;
  return (
    <MapBanner
      // A new first alert is a new banner, closed.
      key={first?.id ?? "unread"}
      data-alerts-banner=""
      // Said to a screen reader once each as it comes (useSpokenAlerts,
      // lib/announce), not as a live region: the countdown under the
      // name changes every few seconds and would be read again each time.
      role="region"
      label="Alerts ahead"
      icon={level === "warning" ? TriangleAlert : CircleAlert}
      tone={level}
      titleTestId="alerts-banner-title"
      title={first ? alertTitle(first) : unread}
      // How many more on the second line, so the first's name is whole on its own.
      sub={
        first && (
          <>
            {alertWhen(first)} · {alertWhere(first)}
            {alerts.length > 1 && <span className="font-semibold"> · {alerts.length - 1} more</span>}
          </>
        )
      }
      more={
        <>
          {alerts.map((a) => (
            <div key={a.id}>
              {a !== first && (
                <p className={cn("font-semibold", BANNER_INK[a.level])}>
                  {alertTitle(a)}: {alertWhen(a)} · {alertWhere(a)}
                </p>
              )}
              <p>{a.need}</p>
              {/* A special-use area's status now, as SFDPS has it. */}
              {a.sfdps_active != null && (
                <p data-testid="alert-sfdps">
                  {saaWords({ designator: a.name, active: a.sfdps_active, until: a.sfdps_until ?? null, heard: 0 })}
                </p>
              )}
            </div>
          ))}
          {first && (failed || unavailable.length > 0) && <p className="text-muted-foreground">{unread}.</p>}
        </>
      }
      actions={
        alerts.length > 0 && (
          <BannerButton
            data-testid="alerts-acknowledge"
            // Its "OK" first, then what it is OK to (WCAG 2.4.6, 2.5.3).
            aria-label="OK, alerts ahead seen"
            onClick={() => acknowledge(alerts.map((a) => a.id))}
          >
            OK
          </BannerButton>
        )
      }
    />
  );
}
