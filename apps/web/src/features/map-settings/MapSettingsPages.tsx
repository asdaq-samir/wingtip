import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { editionOf } from "../../components/chartEdition";
import { ListGroup, ListRow } from "../../components/GroupedList";
import Segmented from "../../components/Segmented";
import { ALERT_MODES, useAlertMode, type AlertMode } from "../../components/alertMode";
import { COPILOT_MODES, useCopilotMode, type CopilotMode } from "../../components/copilotMode";
import { useMicPrimer } from "../../components/MicPrimer";
import { ATC_LISTEN_MODES, setAtcListen, useAtcListen, type AtcListen } from "../../lib/atc/listenSetting";
import { useCanListen } from "../../lib/speechLocal";
import { usePreferences } from "../../lib/preferences";
import { chartQuery } from "../../lib/queryClient";
import { useDataCycles, useLayerAges } from "../../lib/map/sources/layerAges";
import { cycleWarning } from "../../lib/dataCycles";
import { TEXT } from "../../lib/text";

/**
 * Two of the Map card's pages, each a row of its Map Settings page
 * (MapSettingsPage; the owner's pick, option A of the map settings
 * canvas, 2026-11-13): the in-flight alerts and copilots, and where the
 * map's data comes from. The page's name is the card's (MapCardPages), so
 * the group under it has none.
 */
export function MapAlertsPage() {
  const [alertMode, setAlertMode] = useAlertMode();
  const [copilotMode, setCopilotMode] = useCopilotMode();
  const atcListen = useAtcListen((s) => s.value);
  const voice = useCanListen();
  // Why the microphone, before the browser asks (MicPrimer).
  const [micPrimer, primeMic] = useMicPrimer();
  return (
    <>
      {micPrimer}
      {/* The in-flight alerts, off, shown or said aloud (components/alertMode),
          here from Setup's tiles since the owner's ask ("alerts can go to
          overlay settings", 2026-11-05): a pick of three, segmented. */}
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
        {/* The ATC copilot (features/atc): the radio listened to while
            flying, calls to us read into cards. Off until the pilot
            turns it on. Not offered where speech cannot be recognised
            on the device (lib/speechLocal). */}
        {voice && (
          <ListRow title="ATC">
            <Segmented
              label="ATC"
              value={atcListen}
              onChange={(v) => (v === "flying" ? primeMic(() => setAtcListen("flying")) : setAtcListen(v as AtcListen))}
              testId="atc-listen-mode"
              options={ATC_LISTEN_MODES}
            />
          </ListRow>
        )}
      </ListGroup>
    </>
  );
}

export function MapSourcesPage() {
  const traffic = usePreferences((s) => s.traffic);
  // The edition is what a pilot checks: a chart is current for its cycle.
  // adsb.lol's licence (ODbL 1.0, 4.3) asks it be credited, as the owner
  // asked it be here ("say traffic adsb.lol in settings like we do for
  // FAA"). Rows, not a footnote (the owner's "Avoid putting so many footnotes").
  const { data: chart } = useQuery(chartQuery);
  // How old each weather layer's data is, beside where it comes from.
  const ages = useLayerAges();
  // The edition drawn past its 56-day cycle, said under the Charts row
  // (the engine's data_cycle; lib/dataCycles): still drawn, never hidden.
  const chartsCycle = useDataCycles().find((c) => c.key === "charts");
  const chartsWarning = chartsCycle ? cycleWarning(chartsCycle) : null;
  return (
    <>
      {/* Where the map's data comes from, and when the weather layers' is from (lib/map/sources/layerAges):
          the METARs behind the airports' colours and the TFRs as the planner fetched them, the traffic as the map last heard it. */}
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
          value={
            <span className="text-foreground">{traffic && ages.traffic ? `adsb.lol · ODbL · ${ages.traffic}` : "adsb.lol · ODbL"}</span>
          }
          data-testid="traffic-age"
        />
      </ListGroup>
    </>
  );
}
