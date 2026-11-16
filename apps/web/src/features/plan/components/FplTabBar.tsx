import { cn } from "cn";
import { CardTabBar, type CardTab, type CardTabAction } from "../../../components/CardTabBar";
import type { Candidate, Course } from "../../../lib/api/types";
import { ICON } from "../../../lib/icons";
import type { RouteCard } from "../../../lib/openCards";
import { useForeFlight } from "../hooks/useForeFlight";
import { useShareLink } from "../hooks/useShareLink";

/** A mark over a tab's icon's corner, as the airport's Weather dot is. */
function Mark({ testId, finding }: { testId: string; finding: "stop" | "caution" }) {
  return (
    <span
      aria-hidden
      data-testid={testId}
      data-finding={finding}
      className={cn(
        "pointer-events-none absolute -top-0.5 -right-1 size-2.5 rounded-full ring-2 ring-background",
        finding === "stop" ? "bg-destructive" : "bg-caution",
      )}
    />
  );
}

/**
 * FPL's tabs in the airport card's floating glass bar (CardTabBar), the
 * owner, 2026-11-14: "Can we have the same tab bar appear with brief,
 * navlog, profile and share, and open in ForeFlight?". The Nav Log, the
 * Brief and the Profile are tabs (FplTabs), the Brief marked as the worst
 * of its pages is and the Profile where the altitude has a caution or is
 * tight, as their buttons in FPL's bar were; Share (the route's link,
 * useShareLink) and ForeFlight (Open in ForeFlight, useForeFlight) follow
 * as actions, never picked. Their test ids are the old buttons' and menu
 * items': route-navlog, route-brief, route-profile, open-foreflight.
 */
export default function FplTabBar({
  onPick,
  profile,
  briefMark,
  altitudeMark,
  planned,
  course,
  selected,
  altitudeFt,
}: {
  onPick: (tab: RouteCard) => void;
  /** The Profile's tab offered: a route planned, not a local flight. */
  profile: boolean;
  briefMark: "stop" | "caution" | null;
  altitudeMark: "caution" | "tight" | null;
  planned: { dep: string; dest: string; stops: string[] };
  course: Course | null;
  selected: Candidate[];
  altitudeFt: number | undefined;
}) {
  const { share } = useShareLink(planned, altitudeFt);
  const foreflight = useForeFlight(planned, course, selected, altitudeFt).open;
  const tabs: CardTab<RouteCard>[] = [
    { value: "navlog", label: "Nav Log", icon: ICON.navLog },
    {
      value: "brief",
      label: "Brief",
      icon: ICON.brief,
      hint: briefMark && (briefMark === "stop" ? "warning" : "caution"),
      badge: briefMark && <Mark testId="route-brief-mark" finding={briefMark} />,
    },
  ];
  if (profile)
    tabs.push({
      value: "profile",
      label: "Profile",
      icon: ICON.profile,
      hint: altitudeMark && (altitudeMark === "caution" ? "your altitude has a caution" : "your altitude is tight"),
      badge: altitudeMark && <Mark testId={altitudeMark === "caution" ? "own-altitude-flag" : "tight-altitude-flag"} finding="caution" />,
    });
  const actions: CardTabAction[] = [{ label: "Share", icon: ICON.share, testId: "route-share", onClick: () => void share() }];
  if (foreflight)
    actions.push({ label: "ForeFlight", name: "Open in ForeFlight", icon: ICON.send, testId: "open-foreflight", ...foreflight });
  return <CardTabBar<RouteCard> testId="fpl-tab-bar" tabTestId="route-" onPick={onPick} tabs={tabs} actions={actions} />;
}
