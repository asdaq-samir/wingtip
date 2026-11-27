import { Bell, Crosshair, Gauge, History, Info, Share } from "lucide-react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import { SheetCard } from "../../components/SheetCard";
import { CardAction } from "../../components/CardAction";
import IconButton from "../../components/IconButton";
import { ACTION } from "../../lib/cardActions";
import AircraftAlertMenu from "../../components/airplane/AircraftAlertMenu";
import { FavoriteTile } from "../../components/FavoriteTile";
import { CardTabPages, CardTabPanel } from "../../components/CardTabs";
import { CardTabBar, type CardTab } from "../../components/CardTabBar";
import { StatusLine } from "../../components/StatusBadge";
import type { FigureKey } from "../../lib/airplane/figures";
import { TEXT } from "../../lib/text";
import { PohRow } from "../documents/lazy";
import { FlightPictures } from "../traffic/lazy";
import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import { useAirplaneCardModel, type AirplaneCardModel } from "./useAirplaneCardModel";
import type { AirplaneTab } from "./airplaneTabs";
import FiguresTab from "./FiguresTab";
import FlightsTab from "./FlightsTab";
import InfoTab from "./InfoTab";
import { airplanePhotoSlide } from "./photoSlide";

/** Each tab's word and glyph, in the bar's order. */
const TAB: Record<AirplaneTab, Omit<CardTab<AirplaneTab>, "value" | "hint">> = {
  flights: { label: "Flights", icon: History },
  info: { label: "Info", icon: Info },
  figures: { label: "Figures", icon: Gauge },
};

/** The row's columns by its tiles, spelled out for Tailwind. */
const COLUMNS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/** Its actions, the first filled, by its state (the owner's design of
 *  2026-11-26): in the air Track (the map keeps it in the middle), on the
 *  ground Fly This for an airplane the planner can fly; then Alerts (takes
 *  off, lands, comes near) and Favorite. */
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
  const alerts = hex ? (
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
 * its state (Actions). Under them one sideways row of slides
 * (FlightPictures): its flight while it flies, else one line of where it
 * last landed; its photos; the sketch of where it has flown. Then the
 * page of the tab picked in the glass bar at its foot (CardTabBar):
 * Flights, its flight now and its earlier ones, each its replay and
 * debrief (FlightsTab); Info, its FAA record and identifiers; Figures,
 * its planning figures, for an airplane the planner can fly. Its POH, the
 * pilot's own PDF (PohRow), on Figures, else on Info. Traffic the
 * FAA's registry does not hold has Flights alone. Its view model is
 * useAirplaneCardModel.
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
  // Its POH on Figures, else on Info: one row, where its tab is offered.
  const poh = m.tail ? <PohRow tail={m.tail} model={m.pohModel} /> : null;
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
      {/* What it is in a sideways strip (type, year, seats, engines …)
          under its buttons and over its pictures, in sight whichever tab
          is open (the owner, 2026-11-26: "It should be buttons, info strip
          and then the pictures"). */}
      {m.tail && (card.record || live.detail?.faa) && (
        <AirplaneFacts
          record={card.details?.registration ?? card.record ?? live.detail?.faa ?? null}
          model={card.details?.model}
          testId="airplane-facts"
        />
      )}
      <div className="pt-3">
        <FlightPictures
          live={live}
          title={m.title}
          onOpenAirport={m.openAirport}
          photo={airplanePhotoSlide(m.tail, card.photo)}
          trafficPhoto={m.tail ? null : m.hex}
          ground={
            <p
              role="status"
              className={cn(m.tail && card.status.problem ? "text-destructive-ink" : "text-muted-foreground", TEXT.detail)}
              data-testid="airplane-status"
            >
              {m.tail ? <StatusLine words={card.status} /> : (live.chip ?? "Not heard today")}
            </p>
          }
        />
      </div>
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
        {m.tabs.includes("flights") && (
          <CardTabPanel value="flights">
            <FlightsTab m={m} />
          </CardTabPanel>
        )}
        {m.tail && (
          <CardTabPanel value="info" className="pt-0">
            <InfoTab
              card={card}
              faa={live.detail?.faa}
              hex={m.hex}
              callsign={live.plane?.callsign?.trim() || null}
              poh={m.flyable ? null : poh}
            />
          </CardTabPanel>
        )}
        {m.flyable && (
          <CardTabPanel value="figures">
            <FiguresTab vm={vm} poh={poh} />
          </CardTabPanel>
        )}
      </CardTabPages>
    </SheetCard>
  );
}
