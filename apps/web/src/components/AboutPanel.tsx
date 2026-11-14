import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { editionOf } from "./chartEdition";
import { FileText, Hand, LifeBuoy, PlaneTakeoff } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "./GroupedList";
import { RowBadge } from "./RowBadge";
import { DATA_SOURCES, SOFTWARE } from "./dataSources";
import { PLANNING_AID } from "./planningAid";
import { DEMO_AIRPLANE, DEMO_FLIGHT, DEMO_HREF } from "../lib/demoFlight";
import { LEGAL_PAGES } from "../lib/legal";
import { usePreferences } from "../lib/preferences";
import { chartQuery } from "../lib/queryClient";
import { SETTING_BADGE } from "../lib/rowBadges";
import { versionOf } from "../lib/speed";
import { TEXT } from "../lib/text";

const LEGAL_GLYPHS: Record<(typeof LEGAL_PAGES)[number]["key"], ReactNode> = {
  privacy: <Hand />,
  terms: <FileText />,
  support: <LifeBuoy />,
};

/**
 * The console's About tab, after Settings, at the owner's ask ("Design an
 * about tab in settings and you can move the planning aid paragraph
 * there"), laid out as iOS's Settings > General > About: the app's mark
 * and name over a group of what it is -- its build, the
 * chart's edition -- then the planning aid's words, which were the nav
 * log's footer, where the data comes from and what the app draws and
 * writes with, each with the terms it is used under (docs/legal/credits.md,
 * the phones' About lists the same), the privacy policy, terms and
 * support (lib/legal), which App Review wants inside the app, and the
 * demo flight (lib/demoFlight). It was a row of Settings ("About &
 * limits") that opened a sheet, and the legal pages' group under it.
 */
export default function AboutPanel() {
  const { data: chart } = useQuery(chartQuery);
  // The web's build is the entry chunk's hash, as the speed reports name
  // it (lib/speed): one build, one name, and "dev" under vite's server.
  const build = versionOf(document);
  const setAircraft = usePreferences((s) => s.setAircraft);
  return (
    <div className="space-y-5 pb-1" data-testid="about-panel">
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <img src="/app/icon-192.png" alt="" className="size-16 rounded-[22%] shadow-card" />
        <h2 className={cn("font-bold text-foreground", TEXT.card)}>Wingtip Maps</h2>
        <p className={cn("text-foreground", TEXT.detail)}>VFR and IFR flight planning on the FAA chart</p>
      </header>

      <ListGroup>
        <ListRow title="Build" value={build} data-testid="about-build" />
        <ListRow title="Chart edition" value={chart ? editionOf(chart.chart_cycle) : "—"} data-testid="about-chart-edition" />
      </ListGroup>

      {/* What the planner is not, in full: it was the nav log's footer. */}
      <ListGroup title="A planning aid">
        <ListRow
          title={
            <span className={TEXT.detail} data-testid="about-planning-aid">
              {PLANNING_AID}
            </span>
          }
        />
      </ListGroup>

      {/* Checkpoints are found on the FAA sectional itself and ranked by the
          planner's own chart model; the FAA's, NOAA's and the USGS's data
          are works of the US government, which carry no copyright. */}
      <ListGroup title="Data sources">
        {DATA_SOURCES.map((s) => (
          <ListRow key={s.name} title={s.name} value={s.licence} href={s.href} data-testid="about-source" />
        ))}
      </ListGroup>

      <ListGroup title="Maps and software">
        {SOFTWARE.map((s) => (
          <ListRow key={s.name} title={s.name} value={s.licence} href={s.href} data-testid="about-source" />
        ))}
      </ListGroup>

      <ListGroup title="Legal">
        {LEGAL_PAGES.map((p) => (
          <ListRow
            key={p.key}
            media={<RowBadge colour={SETTING_BADGE.about}>{LEGAL_GLYPHS[p.key]}</RowBadge>}
            title={p.title}
            href={p.href}
            data-testid={`legal-${p.key}`}
          />
        ))}
      </ListGroup>

      {/* A fixed flight to show the app with, for App Review and demos:
          the route and the stock 172 picked together, as a pilot would
          pick them, so no airplane is assumed (decision 0011). */}
      <ListGroup>
        <ListRow
          media={
            <RowBadge colour={SETTING_BADGE.about}>
              <PlaneTakeoff />
            </RowBadge>
          }
          title="Demo Flight"
          value={`${DEMO_FLIGHT.dep} to ${DEMO_FLIGHT.dest}`}
          to={DEMO_HREF}
          onClick={() => setAircraft(DEMO_AIRPLANE)}
          data-testid="about-demo-flight"
        />
      </ListGroup>
    </div>
  );
}
