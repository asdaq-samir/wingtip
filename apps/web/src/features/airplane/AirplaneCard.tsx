import { Bell, Crosshair, Gauge, History, Info, Plane, Share } from "lucide-react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import { SheetCard } from "../../components/SheetCard";
import { CardAction } from "../../components/CardAction";
import IconButton from "../../components/IconButton";
import { ACTION } from "../../lib/cardActions";
import { ListGroup, ListRow } from "../../components/GroupedList";
import AircraftAlertMenu from "../../components/airplane/AircraftAlertMenu";
import PastFlights from "../../components/airplane/PastFlights";
import { FavoriteTile } from "../../components/FavoriteTile";
import { CardTabPages, CardTabPanel } from "../../components/CardTabs";
import { CardTabBar, type CardTab } from "../../components/CardTabBar";
import { StatusLine } from "../../components/StatusBadge";
import type { FigureKey } from "../../lib/airplane/figures";
import { TEXT } from "../../lib/text";
import { FlightLiveBox, FlightTab } from "../traffic/lazy";
import { useAirplaneCardModel, type AirplaneCardModel } from "./useAirplaneCardModel";
import type { AirplaneTab } from "./airplaneTabs";
import FiguresTab from "./FiguresTab";
import InfoTab from "./InfoTab";

/** Each tab's word and glyph, in the bar's order. */
const TAB: Record<AirplaneTab, Omit<CardTab<AirplaneTab>, "value" | "hint">> = {
  flight: { label: "Flight", icon: Plane },
  flights: { label: "Flights", icon: History },
  info: { label: "Info", icon: Info },
  figures: { label: "Figures", icon: Gauge },
};

/** The row's columns by its tiles, spelled out for Tailwind. */
const COLUMNS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/** Its actions, the first filled, by its state (the owner's design of
 *  2026-11-26): in the air Track (the map keeps it in the middle), on the
 *  ground Fly This for an airplane the planner can fly; then Alerts (takes
 *  off, lands, comes near) where its history is offered, and Favorite. */
function Actions({ m }: { m: AirplaneCardModel }) {
  const { vm, live, hex } = m;
  const first = m.airborne ? (
    <TogglePrimitive
      key="track"
      pressed={m.following}
      disabled={!live.plane}
      onPressedChange={m.follow}
      render={
        <CardAction
          icon={<Crosshair />}
          label="Track"
          filled
          pressed={m.following}
          testId="airplane-track"
          // The pressed state says whether the map keeps it in sight (WAI-ARIA APG, Button);
          // the visible word in its name (WCAG 2.5.3).
          spoken={`Track ${m.title} on the map`}
        />
      }
    />
  ) : m.flyable ? (
    <CardAction
      key="fly"
      icon={<ACTION.flyHere.icon />}
      label={vm.flying ? "Flying This" : "Fly This"}
      spoken={vm.flying ? "Flying this airplane" : "Fly this airplane"}
      filled
      disabled={vm.flying}
      onClick={m.fly}
      testId="fly-this-airplane"
    />
  ) : null;
  // Alerts by the ICAO address: greyed for an N-number the registry gives none.
  const alerts = !m.history ? null : hex ? (
    <AircraftAlertMenu
      key="alerts"
      hex={hex}
      name={m.title}
      airborne={m.airborne}
      from={live.fromField}
      to={live.toField}
      label="Alerts"
      testId="airplane-alerts"
    />
  ) : (
    <CardAction key="alerts" icon={<Bell />} label="Alerts" disabled testId="airplane-alerts" />
  );
  const tiles = [
    first,
    alerts,
    <FavoriteTile key="favorite" on={m.starred} disabled={!m.kept} onToggle={m.toggleFavorite} testId="airplane-favorite" />,
  ].filter(Boolean);
  // Every tile 56 tall, as the airport card's are (PlaceActions).
  return (
    <div className={cn("grid gap-2 *:min-h-14", COLUMNS[tiles.length])} data-testid="airplane-actions">
      {tiles}
    </div>
  );
}

/**
 * One card an airplane (the owner's design of 2026-11-26, which merged the
 * airplane card and the traffic card; the mockups Main, Ground, Figures and
 * Unregistered): a card over the map's sheet by the one card rule, laid out
 * as the airport card is. Its head: Share, its N-number (else its call
 * sign) with its call sign and what it is under it, and ✕. Its actions by
 * its state (Actions). Always in sight under them, its flight while it
 * flies (FlightLiveBox), else one line of where it last landed. Then the
 * page of the tab picked in the glass bar at its foot (CardTabBar): Flight,
 * this flight; Flights, its past ones, each its replay and debrief; Info,
 * its photo and FAA record; Figures, its planning figures, for an
 * airplane the planner can fly. Traffic the FAA's registry does not hold
 * has Flight and Flights alone. Its view model is useAirplaneCardModel.
 */
export default function AirplaneCard({
  tail,
  hex,
  focus,
  figures,
}: {
  tail: string | null;
  hex: string | null;
  /** The figure it was opened for, its field focused. */
  focus: FigureKey | null;
  figures: boolean;
}) {
  const m = useAirplaneCardModel({ tail, hex, figures });
  const { card, live, vm } = m;
  return (
    <SheetCard
      title={m.title}
      description={m.sub}
      onClose={m.close}
      // Share at the start of its head, ✕ at the end, as the airport's card has them (CardTitle).
      leading={
        <IconButton round label={`Share ${m.title}`} onClick={m.share} data-testid="airplane-share">
          <Share />
        </IconButton>
      }
      closeButton
      testId="airplane-profile"
      // On the figure it was opened for, where it was one.
      initialFocus={() => {
        const field = focus ? document.querySelector<HTMLInputElement>(`[data-figure="${focus}"] input`) : null;
        field?.scrollIntoView({ block: "center" });
        return field ?? true;
      }}
    >
      <Actions m={m} />
      {live.waiting && (
        <p className={cn("pt-2 text-tint", TEXT.note)} data-testid="flight-alerts-set">
          {live.waiting}
        </p>
      )}
      {live.plane ? (
        <FlightLiveBox live={live} onOpenAirport={m.openAirport} />
      ) : (
        <p
          role="status"
          className={cn("px-1 pt-3", m.tail && card.status.problem ? "text-destructive-ink" : "text-muted-foreground", TEXT.detail)}
          data-testid="airplane-status"
        >
          {m.tail ? <StatusLine words={card.status} /> : (live.chip ?? "Not heard today")}
        </p>
      )}
      <CardTabPages
        tab={m.tab}
        onPick={m.pick}
        top={m.setTop}
        bar={
          <CardTabBar<AirplaneTab>
            testId="airplane-tab-bar"
            tabTestId="airplane-tab-"
            onPick={m.pick}
            tabs={m.tabs.map((value) => ({
              value,
              ...TAB[value],
              hint: value === "flights" && card.flightCount ? String(card.flightCount) : null,
            }))}
          />
        }
      >
        {m.hex && (
          <CardTabPanel value="flight" className="pt-0">
            <FlightTab hex={m.hex} live={live} photo={!m.tail} />
          </CardTabPanel>
        )}
        {m.tabs.includes("flights") && (
          <CardTabPanel value="flights">
            {/* Its flights, each ▶ its replay and debrief over this card (PastFlightCard). */}
            {m.hex ? (
              <PastFlights hex={m.hex} onOpen={m.openPast} untitled play type={live.detail?.type ?? live.plane?.type ?? null} />
            ) : (
              <ListGroup>
                <ListRow muted title="No flights to show: the FAA's registry gives no address for this N-number." />
              </ListGroup>
            )}
          </CardTabPanel>
        )}
        {m.tail && (
          <CardTabPanel value="info" className="pt-0">
            <InfoTab tail={m.tail} card={card} faa={live.detail?.faa} />
          </CardTabPanel>
        )}
        {m.flyable && (
          <CardTabPanel value="figures">
            <FiguresTab vm={vm} />
          </CardTabPanel>
        )}
      </CardTabPages>
    </SheetCard>
  );
}
