import { useContext, useEffect, useRef, useState } from "react";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { PillSection } from "../../components/Favorites";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PullDown from "../../components/PullDown";
import QuickControls from "../../components/QuickControls";
import SwitchRow from "../../components/SwitchRow";
import { ALERT_MODES, useAlertMode } from "../../components/alertMode";
import { clearOwnTrail, useOwnTrail } from "../../lib/map/position/ownTrail";
import { AIRPORT_WEATHER, useAirportWeatherPrefs, type AirportWeather } from "../../lib/map/marks/airportWeatherPrefs";
import { keepingAvailable } from "../../lib/map/route/keepRoute";
import { useSettingsGroup } from "../../lib/openSettings";
import { usePreferences } from "../../lib/preferences";
import { CardId, setCard, useSheetCards } from "../../lib/sheetCards";
import GlideRingRow from "./GlideRingRow";
import { AlertsPage, AtcPage, HelpPage, type HelpPages } from "./SettingsPages";

/**
 * The app's Settings, one page, the owner's pick of option A of the
 * account canvas (2026-11-13): a row of You (the avatar's card), and what
 * the Map card's gear opens at its Map group (lib/openSettings, the one
 * way in). How the app behaves, in groups as iOS's Settings has them --
 * Look (Setup's tiles once), Map, In Flight, Data, and Help & About -- where it
 * was the avatar's card's tiles and footer links and the Map card's Map
 * Settings page: one thing called Settings, every control in one home.
 * Its pages (Alerts, ATC, Help & About) push over it, their close back
 * one (ConsolePages).
 */
export default function SettingsPage({ help }: { help: HelpPages }) {
  return (
    <ConsolePages
      back="Settings"
      pages={{
        alerts: { title: "Alerts", content: <AlertsPage /> },
        atc: { title: "ATC", content: <AtcPage /> },
        help: { title: "Help & About", content: <HelpPage pages={help} /> },
      }}
    >
      <div className="flex flex-col gap-5" data-testid="settings-page">
        {/* The app's look, the tiles that were Setup's (QuickControls), big for a hand in
            rough air: Sunlight, Theme and Appearance. */}
        <PillSection title="Look" testId="settings-look">
          <QuickControls />
        </PillSection>
        <MapGroup />
        <InFlightGroup />
        <ListGroup title="Data">
          {/* The base chart along each route loaded, held for the air
              (useKeepOffline); how a keep goes is its toast. Over plain
              http there is no service worker to hold it, and it cannot be
              on. */}
          <KeepRow />
        </ListGroup>
        <ListGroup>
          {/* The guide, the stack's status, the load log, about, where the
              data comes from and the legal pages, one row (the owner,
              2026-11-13), where they were links at the avatar's card's
              foot and a row of the Map Settings. */}
          <PageRow page="help" title="Help & About" testId="help-row" />
        </ListGroup>
      </div>
    </ConsolePages>
  );
}

/** How the map behaves, what the Map card's gear opens Settings at: the
 *  airport weather, the glide ring, the path flown. What is on the map --
 *  the chart, the overlay, the layers -- stays the Map card's. */
function MapGroup() {
  const trailed = useOwnTrail((s) => s.path.length > 1);
  const at = useRef<HTMLDivElement>(null);
  // Asked for as the page opened (lib/openSettings), read once and let go.
  const [wanted] = useState(() => useSettingsGroup.getState().group === "map");
  const card = useContext(CardId);
  // Opened from the Map card's gear: the card it is in all the way up, as
  // a pilot's drag takes it, for the group is under the Look's tiles,
  // below a half card's edge; and scrolled to it where the page is taller
  // than the card. Once the card has come up at its opening size, not
  // before, as opening sets its size afresh (useCardFrame); let go once
  // it is up, or after a few seconds, the pilot's to drag from then.
  useEffect(() => {
    if (!wanted) return;
    useSettingsGroup.setState({ group: null });
    // In You's floating card (ConsoleLayer), no sheet to raise: scrolled to.
    if (!card) {
      at.current?.scrollIntoView({ block: "start" });
      return;
    }
    const raise = () => {
      const entry = useSheetCards.getState().stack.find((e) => e.id === card);
      if (entry?.at === "full") {
        at.current?.scrollIntoView({ block: "start" });
        return true;
      }
      if (entry?.state === "open" && entry.at !== undefined) setCard(card, { at: "full" });
      return false;
    };
    if (raise()) return;
    const stop = useSheetCards.subscribe(() => {
      if (raise()) stop();
    });
    const late = setTimeout(stop, 3000);
    return () => {
      stop();
      clearTimeout(late);
    };
  }, [wanted, card]);
  return (
    <div ref={at} className="scroll-mt-16" data-testid="settings-map">
      <ListGroup title="Map">
        <AirportWeatherRow />
        {/* The glide ring about own ship, off unless turned on (GlideRingGl; the owner, 2026-11-09). */}
        <GlideRingRow />
        {/* Own ship's path flown (OwnTrailGl), put away here: it starts again with the next flight. */}
        <ListRow title="Clear Your Path" disabled={!trailed} onClick={clearOwnTrail} data-testid="own-trail-clear" />
      </ListGroup>
    </div>
  );
}

/** Each field's weather over the chart, one menu of three (the owner,
 *  2026-11-13; lib/map/marks/airportWeatherPrefs): its own page of a
 *  look and three switches before. The amber ↓ at a plan's field whose
 *  weather gets worse by the pilot's time there is drawn with all three. */
function AirportWeatherRow() {
  const show = useAirportWeatherPrefs((s) => s.show);
  const set = useAirportWeatherPrefs((s) => s.set);
  return (
    <ListRow title="Airport Weather">
      <PullDown<AirportWeather>
        label="Airport weather"
        value={show}
        onChange={set}
        testId="airport-weather-look"
        align="end"
        options={AIRPORT_WEATHER.map((o) => ({ value: o.value, label: o.label, testId: `airport-weather-${o.value}` }))}
      />
    </ListRow>
  );
}

/** The in-flight alerts, a page of their own, their mode at the row's
 *  end; and the radio's -- Comms Assist, the ATC copilot and the copilot
 *  -- one page, ATC (the owner, 2026-11-13). */
function InFlightGroup() {
  const [alertMode] = useAlertMode();
  return (
    <ListGroup title="In Flight">
      <PageRow page="alerts" title="Alerts" value={ALERT_MODES.find((m) => m.value === alertMode)?.label} testId="alerts-row" />
      <PageRow page="atc" title="ATC" testId="atc-row" />
    </ListGroup>
  );
}

function KeepRow() {
  const keepOffline = usePreferences((s) => s.keepOffline);
  const setKeepOffline = usePreferences((s) => s.setKeepOffline);
  return (
    <SwitchRow
      title="Keep for the Air"
      on={keepOffline && keepingAvailable()}
      onChange={setKeepOffline}
      disabled={!keepingAvailable()}
      testId="keep-offline-toggle"
    />
  );
}
