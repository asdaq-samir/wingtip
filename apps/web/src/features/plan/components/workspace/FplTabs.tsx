import { Suspense, useEffect, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";
import { CardTabPages } from "../../../../components/CardTabs";
import Segmented from "../../../../components/Segmented";
import { TabsContent } from "../../../../components/ui/tabs";
import { useOpenedOnce } from "../../../../components/sheet/useOpenedOnce";
import type { RouteCard } from "../../../../lib/openCards";
import type { FlightRules } from "../../../../lib/preferences";
import { useTabScroll } from "../../../../lib/tabScroll";
import { TEXT } from "../../../../lib/text";
import { BriefPage, FplTabBar } from "../../routePanelParts";
import { ProfileCautions } from "../ProfileCard";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import ProfileLine from "./ProfileLine";
import ProfileSideView from "./ProfileSideView";

/** The flight rules a route is planned under, as the Profile's switch
 *  offers them. */
const FLIGHT_RULES = [
  { value: "vfr", label: "VFR" },
  { value: "ifr", label: "IFR" },
];

/** Where the pages start: under FPL's head band (its bar and the route's
 *  row, sticky at the scroller's top), whose height `useBandRoom` keeps. */
const UNDER_BAND = "top-(--fpl-band,0px)";

/** The head band's height on the scroller (`--fpl-band`), followed as the
 *  route's row grows or shrinks (a stop added, the box opened): the pages'
 *  mark sticks under it (UNDER_BAND), and the Brief's own pinned head. The
 *  band is the sheet's (SheetParts' data-head-band), the scroller's first
 *  child. */
function useBandRoom(mark: HTMLElement | null) {
  useEffect(() => {
    const scroller = mark?.closest<HTMLElement>("[data-sheet-scroll]");
    const band = scroller?.querySelector<HTMLElement>(":scope > [data-head-band]");
    if (!scroller || !band) return;
    const keep = () => scroller.style.setProperty("--fpl-band", `${band.offsetHeight}px`);
    keep();
    const watch = new ResizeObserver(keep);
    watch.observe(band);
    return () => {
      watch.disconnect();
      scroller.style.removeProperty("--fpl-band");
    };
  }, [mark]);
}

/** A tab's page, kept once drawn: a switch back is at once, its layout and
 *  place kept (index.css's tab-page by Base UI's data-hidden), as the
 *  Brief's own pages are (PanelTabs); every one on paper. */
function FplTabPage({ value, testId, children }: { value: RouteCard; testId: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      keepMounted
      hidden={false}
      className="tab-page mt-0 flex min-h-0 flex-col print:[content-visibility:visible]!"
      data-testid={testId}
    >
      {children}
    </TabsContent>
  );
}

/**
 * FPL's body with a route, its tabs (the owner, 2026-11-14: "Can we have
 * the same tab bar appear with brief, navlog, profile and share, and open in
 * ForeFlight?"): under the route's row the page of the tab picked -- the
 * Nav Log, the route in order and its legs, FPL's first and its body as it
 * always was; the Brief (BriefPage); the Profile, its rules, the line of
 * its cruise and clearance, its cautions and the side view -- and the
 * airport card's floating glass bar at the sheet's foot (FplTabBar,
 * CardTabBar), with Share and ForeFlight after the tabs. The bar once the
 * route is planned; before, the Nav Log alone. Each tab opens at its own
 * top under the route's row and nothing jumps on a switch (useTabScroll).
 */
export default function FplTabs({
  vm,
  navLog,
  briefContents,
  briefNotice,
}: {
  vm: PlanWorkspaceModel;
  /** The Nav Log's page (useNavLog). */
  navLog: ReactNode;
  briefContents: ComponentProps<typeof BriefPage>["contents"];
  briefNotice: ReactNode;
}) {
  const { flightRules, planned, routeKey, routed, setFlightRules } = vm.route;
  const { course, s, selected } = vm.plan;
  const { fplTab, pickTab, profileReady, showLegs } = vm.fpl;
  const { altitudeMark, briefMark, marks, profileCautions } = vm.brief;
  // The tab up: the Nav Log until there is a route to brief, and where the
  // Profile is not offered (a local flight).
  const tab: RouteCard = !routed || (fplTab === "profile" && !profileReady) ? "navlog" : fplTab;
  const [mark, setMark] = useTabScroll(tab);
  useBandRoom(mark);
  // Each drawn from its first opening on, then kept.
  const briefDrawn = useOpenedOnce(routed && tab === "brief");
  const profileDrawn = useOpenedOnce(profileReady && tab === "profile");
  return (
    <CardTabPages
      tab={tab}
      onPick={pickTab}
      top={setMark}
      pin={UNDER_BAND}
      bar={
        routed && (
          <div className="contents print:hidden">
            <Suspense fallback={null}>
              <FplTabBar
                onPick={pickTab}
                profile={profileReady}
                briefMark={briefMark}
                altitudeMark={altitudeMark}
                planned={planned}
                course={course}
                selected={selected}
                altitudeFt={s.nav?.altitude_ft ?? undefined}
              />
            </Suspense>
          </div>
        )
      }
    >
      <FplTabPage value="navlog" testId="navlog-page">
        {navLog}
      </FplTabPage>
      {routed && briefDrawn && (
        <FplTabPage value="brief" testId="brief-tab">
          {/* The Brief's own pinned head (its pages' tabs) under FPL's band. */}
          <div style={{ "--sheet-head": "var(--fpl-band, 0px)" } as CSSProperties}>
            <BriefPage route={routeKey} contents={briefContents} notice={briefNotice} marks={marks} onLegs={showLegs} />
          </div>
        </FplTabPage>
      )}
      {profileReady && profileDrawn && (
        <FplTabPage value="profile" testId="profile-page">
          <div className="flex flex-col gap-3 px-4 pt-3 print:hidden">
            {/* The rules, a segmented control at its top with no label of its
                own (the owner's "don't need the label flight rules"). */}
            <div className="flex justify-center">
              <Segmented
                label="Flight rules"
                value={flightRules}
                onChange={(v) => setFlightRules(v as FlightRules)}
                testId="flight-rules"
                options={FLIGHT_RULES}
              />
            </div>
            {/* The cruise and the clearance's verdict, where the card had it
                under its name. */}
            <p className={cn("text-center text-muted-foreground", TEXT.detail)} data-testid="profile-line">
              <ProfileLine vm={vm} />
            </p>
            <ProfileCautions cautions={profileCautions} />
            <ProfileSideView vm={vm} />
          </div>
        </FplTabPage>
      )}
    </CardTabPages>
  );
}
