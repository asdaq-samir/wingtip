import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { editionOf } from "../../components/chartEdition";
import { ConsolePages, PageLink, PageRow } from "../../components/ConsolePages";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { PAGE_LINK } from "../../components/pageLink";
import { useCredits } from "../../lib/map/gl/creditStore";
import { trafficCredit } from "../plan/map/trafficCredit";
import Segmented from "../../components/Segmented";
import SwitchRow from "../../components/SwitchRow";
import { ALERT_MODES, useAlertMode, type AlertMode } from "../../components/alertMode";
import { COPILOT_MODES, useCopilotMode, type CopilotMode } from "../../components/copilotMode";
import { useMicPrimer } from "../../components/MicPrimer";
import { setCommsAssist, useCommsAssist } from "../../lib/atc/commsAssist";
import { ATC_LISTEN_MODES, setAtcListen, useAtcListen, type AtcListen } from "../../lib/atc/listenSetting";
import { LEGAL_PAGES } from "../../lib/legal";
import { useCanListen } from "../../lib/speechLocal";
import { usePreferences } from "../../lib/preferences";
import { chartQuery } from "../../lib/queryClient";
import { useDataCycles, useLayerAges } from "../../lib/map/sources/layerAges";
import { cycleWarning } from "../../lib/dataCycles";
import { TEXT } from "../../lib/text";

/*
 * Settings' pages (SettingsPage; the owner's option A, 2026-11-13): the
 * in-flight alerts; ATC, the radio's three in one page; and Help & About,
 * with where the map's data comes from among them. Each page's name is on
 * its head (ConsolePages), so the group under it has none.
 */

/** The in-flight alerts, off, shown or said aloud (components/alertMode):
 *  a pick of three, segmented. */
export function AlertsPage() {
  const [alertMode, setAlertMode] = useAlertMode();
  return (
    <ListGroup>
      <ListRow title="Alerts">
        <Segmented
          label="Alerts"
          value={alertMode}
          onChange={(v) => setAlertMode(v as AlertMode)}
          testId="alerts-mode"
          options={ALERT_MODES}
        />
      </ListRow>
    </ListGroup>
  );
}

/** The radio, one page (the owner, 2026-11-13: Comms Assist, the ATC
 *  alerts and the copilot together): Comms Assist's button on the map,
 *  the ATC copilot listening while flying, and the in-flight copilot. */
export function AtcPage() {
  const commsAssist = useCommsAssist((s) => s.value);
  const [copilotMode, setCopilotMode] = useCopilotMode();
  const atcListen = useAtcListen((s) => s.value);
  const voice = useCanListen();
  // Why the microphone, before the browser asks (MicPrimer).
  const [micPrimer, primeMic] = useMicPrimer();
  return (
    <>
      {micPrimer}
      <ListGroup>
        {/* The radio's button on the map is off until turned on: comms
            assist is kept but not in the way (the owner, 2026-11-13). */}
        <SwitchRow title="Comms Assist" on={commsAssist} onChange={setCommsAssist} testId="comms-assist-toggle" />
        {/* The ATC copilot (features/atc): the radio listened to while
            flying, calls to us read into cards. Off until the pilot
            turns it on. Not offered where speech cannot be recognised
            on the device (lib/speechLocal). */}
        {voice && (
          <ListRow title="ATC Alerts">
            <Segmented
              label="ATC alerts"
              value={atcListen}
              onChange={(v) => (v === "flying" ? primeMic(() => setAtcListen("flying")) : setAtcListen(v as AtcListen))}
              testId="atc-listen-mode"
              options={ATC_LISTEN_MODES}
            />
          </ListRow>
        )}
        {/* The in-flight copilot (features/copilot), off, shown or said aloud, as the alerts are. */}
        <ListRow title="Copilot">
          <Segmented
            label="Copilot"
            value={copilotMode}
            onChange={(v) => setCopilotMode(v as CopilotMode)}
            testId="copilot-mode"
            options={COPILOT_MODES}
          />
        </ListRow>
      </ListGroup>
    </>
  );
}

/** Help & About's pages that are the pilot's console's to make: the
 *  guide (the developer's own on the developer's page), the status, the
 *  load log and about (PilotPanel). */
export type HelpPages = Record<"guide" | "status" | "log" | "about", { title: string; content: ReactNode }>;

/** Help & About, one row of Settings (the owner, 2026-11-13): the guide,
 *  the status, the log, about and the sources a row each, the legal
 *  pages a link each at its foot. */
export function HelpPage({ pages }: { pages: HelpPages }) {
  return (
    <ConsolePages back="Help & About" pages={{ ...pages, sources: { title: "Sources", content: <SourcesPage /> } }}>
      <div className="flex flex-col gap-5">
        <ListGroup>
          <PageRow page="guide" title="Guide" testId="guide-link" />
          {/* How old the plan's data is, and what is kept through a dropped
              connection, for every pilot (the owner, 2026-11-04). */}
          <PageRow page="status" title="Status" testId="status-link" />
          {/* When the map's layers showed at this device's loads (lib/loadLog). */}
          <PageRow page="log" title="Log" testId="log-link" />
          <PageRow page="about" title="About" testId="about-link" />
          {/* Where the map's data comes from and how old it is. */}
          <PageRow page="sources" title="Sources" testId="sources-row" />
        </ListGroup>
        {/* Privacy, Terms and Legal (about's list of every data source and
            its licence), links at the foot (the owner, 2026-11-11). Sixteen
            apart and the rows 24, so the links' 44-point hit areas meet. */}
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-6 pb-2" data-testid="settings-foot">
          {LEGAL_PAGES.filter((p) => p.key !== "support").map((p) => (
            <a key={p.key} href={p.href} target="_blank" rel="noopener" className={PAGE_LINK} data-testid={`settings-${p.key}`}>
              {p.key === "privacy" ? "Privacy" : "Terms"}
            </a>
          ))}
          <PageLink page="about" testId="settings-legal">
            Legal
          </PageLink>
        </nav>
      </div>
    </ConsolePages>
  );
}

/** Where the map's data comes from, and when the weather layers' is from. */
function SourcesPage() {
  const traffic = usePreferences((s) => s.traffic);
  // The edition is what a pilot checks: a chart is current for its cycle.
  // adsb.lol's licence (ODbL 1.0, 4.3) asks it be credited, as the owner
  // asked it be here ("say traffic adsb.lol in settings like we do for
  // FAA"). Rows, not a footnote (the owner's "Avoid putting so many footnotes").
  const { data: chart } = useQuery(chartQuery);
  // How old each weather layer's data is, beside where it comes from.
  const ages = useLayerAges();
  // Whose traffic the map draws, as the map credits it (TrafficGl's
  // trafficCredit: adsb.lol's, adsb.fi's or ADS-B Exchange's), where it
  // always said adsb.lol (the commonality audit's MAP-6, CODE-31);
  // adsb.lol's, the planner's first, before the map has asked.
  // The row's own title says Traffic: the credit without it.
  const trafficSource = (useCredits((c) => c.credits.traffic) ?? trafficCredit(undefined)).replace(/^Traffic /, "");
  // The edition drawn past its 56-day cycle, said under the Charts row
  // (the engine's data_cycle; lib/dataCycles): still drawn, never hidden.
  const chartsCycle = useDataCycles().find((c) => c.key === "charts");
  const chartsWarning = chartsCycle ? cycleWarning(chartsCycle) : null;
  return (
    // The METARs behind the airports' colours and the TFRs as the planner
    // fetched them, the traffic as the map last heard it (lib/map/sources/layerAges).
    <ListGroup>
      <ListRow
        title="Charts"
        value={<span className="text-foreground">{chart ? `FAA, ${editionOf(chart.chart_cycle)}` : "FAA"}</span>}
        data-testid="chart-edition"
        description={
          chartsWarning ? (
            <span className={cn("text-destructive-ink", TEXT.detail)} data-testid="chart-edition-out-of-date">
              {chartsWarning}
            </span>
          ) : undefined
        }
      />
      <ListRow
        title="METARs"
        value={<span className="text-foreground">{ages.metars ? `aviationweather.gov · ${ages.metars}` : "aviationweather.gov"}</span>}
        data-testid="metars-age"
      />
      <ListRow
        title="TFRs"
        value={<span className="text-foreground">{ages.tfrs ? `tfr.faa.gov · ${ages.tfrs}` : "tfr.faa.gov"}</span>}
        data-testid="tfrs-age"
      />
      <ListRow
        title="Traffic"
        value={<span className="text-foreground">{traffic && ages.traffic ? `${trafficSource} · ${ages.traffic}` : trafficSource}</span>}
        data-testid="traffic-age"
      />
    </ListGroup>
  );
}
