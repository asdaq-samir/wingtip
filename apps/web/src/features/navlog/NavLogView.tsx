import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import PanelTabs from "./PanelTabs";
import { usePrinting } from "../plan/lazy";
import { LEGS, descriptionKey, legsWithoutWind } from "../plan";
import { isLegPoint, navLogRows, rowPoint } from "../plan";
import { type NavLogRow, dryRunRow, DRY_RUN, usePastFlight } from "../plan";
import { SectionPane } from "../../components/SectionPane";
import { nm } from "../../lib/format";
import { useAnnounce } from "../../lib/announce";
import { routeName } from "../../lib/identSchema";
import { revealRow } from "../../lib/revealRow";
import { TEXT } from "../../lib/text";
import SectionTitle from "../../components/SectionTitle";
import RouteProfileSection from "./RouteProfileSection";
import { NavLogList } from "./NavLogList";
import { NavLogPaperHead } from "./NavLogPaperHead";
import { NavLogNote } from "./NavLogNote";
import { NavLogSummary } from "./NavLogSummary";
import { NavLogTable } from "./NavLogTable";
import { navLogColumns } from "./navLogColumns";
import type { NavLogViewProps } from "./NavLogViewProps";
import { useIsDesktop } from "../../hooks/use-desktop";
import { hoverLeg } from "../../lib/map/marks/mapHover";
import { useAirplaneChosen } from "../../lib/preferences";

/**
 * The nav log itself -- the planner's own drawer content (in place of
 * a plain checkpoint list), so a pilot can walk the route's real
 * dead-reckoning numbers with the chart still visible beside it. The
 * walk is the point: Up/Down (PlanWorkspace's own keys) or a click steps
 * the selection through departure, every checkpoint and the
 * destination, the map follows to whichever is selected, and selecting
 * a point on the map (or another row) scrolls this one into view --
 * the same two-way link the old checkpoint list had.
 *
 * This panel is the briefing, in tabs: the nav log's own first -- the
 * totals above the table, the fuel check and the route's profile under
 * it -- and the briefing's parts in the others, from PlanWorkspace
 * (`tabContent`: FlightBriefingView's parts). The two inputs the log is
 * computed from, the airplane and the departure time, are the panel's controls
 * (FlightInputs). The briefing
 * used to draw its own read-only copy of the table, and the two
 * drifted; then the drawer had two widths, the table alone and the
 * whole briefing, which held the same things in two arrangements.
 *
 * One row per waypoint, not one row per leg with both its ends named
 * on it -- a paper nav log runs down the page checkpoint by checkpoint,
 * each one's row holding the leg it took to get there. The departure
 * is the exception: it opens the log with nothing to its right, since
 * no leg has been flown yet.
 */
export default function NavLogView({
  totals,
  nav,
  depart,
  legs,
  dep,
  dest,
  ends,
  selected,
  descriptions,
  onSaveDescription,
  tabContent,
  children,
  marks,
  notice,
  cardHead,
  local,
  metarColourOf,
  selectedPoint,
  onSelectPoint,
  onDeselectPoint,
  drawerOpen,
  aircraftLabel,
  dryRun,
  route,
}: NavLogViewProps) {
  // Where the log's rows are in sight: FPL all the way up, and never where
  // the route's list is in their place.
  const logInSight = !route && drawerOpen;
  const noWind = totals ? legsWithoutWind(totals) : null;
  // Its winds past their forecast's period are the route box's refresh's
  // dot now (PlanWorkspace's `stale`), at the owner's ask.
  // The other tabs' code fetched while nothing else is, once the log is
  // in, so the first opening of each draws rather than downloads: the
  // weight and balance envelope was 0.4 s of the Performance tab's first.
  const logIn = !!totals;
  useEffect(() => {
    if (!logIn) return;
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 1500));
    const handle = idle(() => {
      void import("./EnvelopeChart");
      void import("./ProfileChart");
    });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(handle);
  }, [logIn]);
  // For the printer every page, one after another: the paper is the whole
  // briefing whatever was up on screen (usePrinting).
  const printing = usePrinting();
  // On a desktop's side panel the log on screen is the dense table, its
  // heading held as it scrolls (web.md §4); a phone's is a line a point.
  const onDesk = useIsDesktop() && !printing;
  const airplane = useAirplaneChosen();
  // The leg lit on the map by a mouse put away with the table.
  useEffect(() => () => hoverLeg(null), []);
  // One row per waypoint the plan knows about, regardless of how many
  // legs have streamed in: a row whose leg has not arrived shows a dash
  // in every column that needs one. Kept while they are the same
  // (useMemo): a new list was the profile chart drawn again at every row
  // picked. (The column defs close over this render's `nav` and `depart`,
  // so navLogColumns is called here, not at module scope.)
  const data = useMemo(() => navLogRows(ends, selected, legs), [ends, selected, legs]);
  // Each checkpoint's number, as its dot on the map has it (RouteMap):
  // its place among the chosen, from one.
  const numbers = useMemo(() => new Map(selected.map((c, i) => [descriptionKey(c.lat, c.lon), i + 1])), [selected]);
  // Whether the clouds the altitude breakdown found (14 CFR 91.155) can be
  // put on legs at all: its segments run fix to fix, as the rows do, so
  // they line up when there is one segment fewer than rows. When they do
  // not, the nav log's summary says so once.
  const segments = nav?.altitude_selection.segments ?? [];
  const perLeg = segments.length > 0 && segments.length === data.filter((r) => !isLegPoint(r)).length - 1;
  const shownColumns = navLogColumns({ nav, depart, numbers, metarColourOf, onDesk, airplane: !!airplane });
  useAnnounce(totals && data.length ? `Nav log ready, ${nm(totals.distance_nm)}` : null); // to VoiceOver, once (WEB-16)
  // The selected row as it is put in the page: the rows are drawn a moment
  // after the panel (PanelTabs' deferred draw), and on a busy page after
  // the drawer had opened, so a reveal asked for then found no row and the
  // pick was left under the drawer's foot (checkpoints.spec, one run in
  // three with two workers). Its arrival is a reason to look again.
  const [selectedRow, setSelectedRow] = useState<HTMLElement | null>(null);
  // The row the dry run is flying to, at the owner's ask ("I wanna be
  // able to do the dry run with navlog in full fpl"): a row at a time (the
  // run's every frame is not this view's), brought into sight as it moves
  // on, where the pilot's own selection is brought, and left where it is
  // once in sight -- all the way up only: half way the sheet shows the
  // route and the run's chart, which a scroll to the log would move.
  const flying = usePastFlight((p) => (dryRun && p.hex === DRY_RUN && p.at !== null ? dryRunRow(dryRun, p.at) : null));
  const [flyingRow, setFlyingRow] = useState<HTMLElement | null>(null);
  useEffect(() => (logInSight ? revealRow(flyingRow) : undefined), [flyingRow, flying, logInSight]);
  // Selecting a point on the map should be as visible here as
  // clicking the row itself would have been -- otherwise the
  // highlighted row can be scrolled out of view in this (now often
  // narrow, since it's a draggable sidebar) column and looks like
  // nothing happened. Brought to the middle when it is out of view
  // (a point picked on the map, the drawer opened after), left where
  // it is when it is not (the row itself clicked). On the nav log's
  // own section opening too: on a phone the drawer is mounted afresh
  // each time it opens, with every section closed, and the row is only
  // there to reveal once that section has been opened -- and on that
  // section alone, not on any section: opening the winds or the
  // NOTAMs further down used to scroll the drawer back up to the
  // selected row. And on the drawer opening: beside a desktop map the
  // view is mounted, and its rows laid out, while the drawer is
  // closed, so a row revealed then was revealed off screen. (A pick brings
  // its tab up, PanelTabs.)
  useEffect(() => revealRow(selectedRow), [selectedRow, selectedPoint, logInSight]);
  const isSelected = (lat: number, lon: number) =>
    !!selectedPoint && descriptionKey(lat, lon) === descriptionKey(selectedPoint.lat, selectedPoint.lon);
  const noteOf = (r: NavLogRow, rowSelected: boolean) => (
    <NavLogNote
      r={r}
      rowSelected={rowSelected}
      descriptions={descriptions}
      onSaveDescription={onSaveDescription}
      onSelectPoint={onSelectPoint}
    />
  );

  const navLogTable = (
    <NavLogTable
      data={data}
      columns={shownColumns}
      onDesk={onDesk}
      printing={printing}
      airplane={!!airplane}
      dep={dep}
      dest={dest}
      totals={totals}
      flying={flying}
      isSelected={isSelected}
      noteOf={noteOf}
      onSelectPoint={onSelectPoint}
      onDeselectPoint={onDeselectPoint}
      setSelectedRow={setSelectedRow}
      setFlyingRow={setFlyingRow}
    />
  );

  // On screen the log a line a point (NavLogList), under its count of
  // checkpoints, none over a direct leg ("0 Checkpoints"); the table, paper's.
  const checkpointCount = data.filter((r) => r.kind === "checkpoint").length;
  const navLogList =
    data.length === 0 ? (
      <p className={cn("py-3", TEXT.detail)}>No route planned yet</p>
    ) : (
      <>
        <div className="flex items-center justify-between pt-2 pl-1.5 empty:hidden" data-testid="navlog-head">
          {checkpointCount > 0 && <SectionTitle>{`${checkpointCount} Checkpoint${checkpointCount === 1 ? "" : "s"}`}</SectionTitle>}
        </div>
        <NavLogList
          rows={data}
          label={`Navigation log from ${dep} to ${dest}`}
          numberOf={(r) => (r.kind === "checkpoint" ? numbers.get(r.key) : undefined)}
          weather={metarColourOf}
          isSelected={(r) => {
            const { lat, lon } = rowPoint(r);
            return isSelected(lat, lon);
          }}
          onSelect={(r) => {
            const { lat, lon } = rowPoint(r);
            onSelectPoint(lat, lon);
          }}
          onDeselect={onDeselectPoint}
          flying={flying}
          selectedRef={setSelectedRow}
          flyingRef={setFlyingRow}
          depart={depart}
          note={noteOf}
        />
      </>
    );

  // The legs, FPL's own at the owner's ask ("FPL is simple with route,
  // navlog, profile and calculations"): no heading on screen, where they
  // are all FPL shows under the route; the briefing's pages are the Brief's
  // card's (BriefCard).
  const legsSection = (
    <SectionPane title={LEGS} heading={printing && !local}>
      {!local && <NavLogSummary noWind={noWind} nav={nav} perLeg={perLeg} />}
      {!local && (printing ? navLogTable : (route ?? (onDesk ? navLogTable : navLogList)))}
    </SectionPane>
  );
  const title = routeName(
    dep,
    dest,
    ends?.stops?.map((s) => s.ident),
  );
  const paper = printing && !cardHead;
  return (
    <>
      {paper ? (
        // On paper the whole briefing, as it always printed: every page in
        // turn, the legs first in En route's, under the briefing's title.
        <PanelTabs
          printing
          marks={marks}
          route={title}
          notice={notice}
          before={<NavLogPaperHead title={title} aircraftLabel={aircraftLabel} depart={depart} totals={totals} />}
          contents={{
            preflight: tabContent("preflight"),
            depart: tabContent("depart"),
            enroute: (
              <section aria-label={local ? "Local Flight" : "Nav Log"} className={TEXT.prose}>
                {legsSection}
                {/* The same legs from the side, on paper only: on screen the
                    side view pinned at the sheet's foot is the one, the log
                    scrolling over it, at the owner's ask ("let's cleanup the
                    clutter with redesign. Keep the profile pinned at the
                    bottom as you pull up the navlog"). Then the figures the
                    altitude was chosen within. */}
                {!local && ends && <RouteProfileSection ends={ends} rows={data} />}
                {!local && tabContent("profile")}
                {tabContent("enroute")}
              </section>
            ),
            arrive: tabContent("arrive"),
          }}
        />
      ) : (
        <div className="flex shrink-0 flex-col">
          {/* The drawer's name for a screen reader: on screen it is the
              tab's, said once there. */}
          <span className="sr-only" data-testid="drawer-title">
            Flight Planning
          </span>
          {/* The bottom inset clears the home indicator on an installed
              app; laid out whole in the sheet's one scroller (SheetParts). */}
          <div
            className="@container pr-4 pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))]"
            data-testid={cardHead ? "navlog-card-scroller" : "navlog-scroller"}
          >
            {cardHead}
            <section
              aria-label={local ? "Local Flight" : route ? "Route" : "Nav Log"}
              className={cn(TEXT.prose, cardHead && "pt-2")}
              data-testid={cardHead ? "navlog-sheet" : undefined}
            >
              {legsSection}
            </section>
          </div>
        </div>
      )}
      {/* Where it is either way, so turning to paper does not draw it
          afresh: the kneeboard's card is printed from it. */}
      {children}
    </>
  );
}
