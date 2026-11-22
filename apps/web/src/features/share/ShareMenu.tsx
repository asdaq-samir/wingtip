import type { ComponentProps, ReactNode } from "react";
import type { RouteCard } from "../../lib/openCards";
import { ShareMenuShell, type ShellLook } from "./ShareMenuShell";
import { RouteMore } from "./RouteMore";
import { BriefShare } from "./BriefShare";
import { NavLogShare } from "./NavLogShare";
import { ShareLinkItem, type SharedRoute } from "./shareItems";

/** The profile's share: its link. */
function ProfileShare({ route, ...look }: ShellLook & { route: SharedRoute }) {
  return (
    <ShareMenuShell card="profile" {...look}>
      {() => <ShareLinkItem route={route} />}
    </ShareMenuShell>
  );
}

/**
 * The route's ••• (More), a button of FPL's floating bar, of the flying
 * drawer's tiles or of the first row, and each of the route's cards' Share,
 * each card's own at the owner's asks ("every share button needs to be
 * specific to that card. So printing briefing should only be in brief
 * card"; "printing navlog should be in navlog"): the route's More has Route
 * Options, its link and Open in ForeFlight (RouteMore); the Brief's, its
 * link, Save and the solo cross-country review, Print the briefing and
 * Refresh (BriefShare); the nav log's, its link, the checkpoints for
 * ForeFlight and the nav log printed (NavLogShare); the profile's, its link.
 * Each over the one menu (ShareMenuShell). Filing the flight plan is not in
 * any of them: File is its own button beside FPL's floating bar (FplTabBar,
 * the owner, 2026-11-21). Only once there is a route (PlanWorkspace).
 *
 * Out of the workspace (PlanWorkspace), which only says what the route is
 * and hands in what the lazy route panel draws: Save and the review's item
 * (`saving`), and the review's sheet (`reviewSheet`), opened here as the
 * menu goes.
 */
export default function ShareMenu({
  card = "route",
  testId = "share-route",
  ...rest
}: Omit<ShellLook, "testId"> &
  Pick<ComponentProps<typeof RouteMore>, "routeOptions"> &
  Pick<ComponentProps<typeof BriefShare>, "planAgain"> & {
    testId?: string;
    /** Whose menu it is: the route's ••• (its sharing too, since Share left
     *  the floating bar, the owner 2026-11-17), or one of the route's cards'. */
    card?: "route" | RouteCard;
    route: SharedRoute;
    saving: (askReview: () => void) => ReactNode;
    reviewSheet: (done: () => void) => ReactNode;
  }) {
  const { routeOptions, planAgain, saving, reviewSheet, ...menu } = rest;
  const props = { ...menu, testId };
  if (card === "brief") return <BriefShare {...props} saving={saving} reviewSheet={reviewSheet} planAgain={planAgain} />;
  if (card === "navlog") return <NavLogShare {...props} />;
  if (card === "profile") return <ProfileShare {...props} />;
  return <RouteMore {...props} routeOptions={routeOptions} />;
}
