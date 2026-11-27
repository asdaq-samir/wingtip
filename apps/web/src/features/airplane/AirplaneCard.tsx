import { Bell, Crosshair, Gauge, History, Info } from "lucide-react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import { SheetCard } from "../../components/SheetCard";
import { CardAction } from "../../components/CardAction";
import { CardTitle } from "../../components/CardTitle";
import { ACTION } from "../../lib/cardActions";
import AircraftAlertMenu from "../../components/airplane/AircraftAlertMenu";
import { FavoriteTile } from "../../components/FavoriteTile";
import { CardTabPages, CardTabPanel } from "../../components/CardTabs";
import { CardTabBar } from "../../components/CardTabBar";
import { StatusLine } from "../../components/StatusBadge";
import type { FigureKey } from "../../lib/airplane/figures";
import { TEXT } from "../../lib/text";
import { PohRow } from "../documents/lazy";
import { FlightNowBox, FlightPictures, liveFacts } from "../traffic/lazy";
import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import { useAirplaneCardModel, type AirplaneSlices, type AirplaneTab } from "./useAirplaneCardModel";
import { FlightsPage, InfoPage } from "./AirplanePage";
import FiguresCard from "./FiguresCard";
import { airplanePhotoSlide } from "./photoSlide";

/** Its actions, the first filled, by its state (the owner's design of
 *  2026-11-26): in the air Track (the map keeps it in the middle), on the
 *  ground Fly This for an airplane the planner can fly; then Alerts (takes
 *  off, lands, comes near), Favorite, and for an airplane the planner can
 *  fly Figures, its planning figures' card (the owner, 2026-11-26: "It
 *  should be the fourth button above"). Always the four, in their places,
 *  one greyed where it does nothing for this airplane (the owner,
 *  2026-11-27: "Keep four buttons on top, just disable the one when
 *  needed"): Fly This and Figures for one the planner cannot fly, Alerts
 *  with no ICAO address, Favorite with nothing to keep. */
function Actions({ m }: { m: AirplaneSlices<"actions" | "head" | "hex" | "live"> }) {
  const { actions: a, live, hex } = m;
  const { title } = m.head;
  const first = a.airborne ? (
    <TogglePrimitive
      key="track"
      pressed={a.following}
      disabled={!live.plane}
      onPressedChange={a.follow}
      render={
        <CardAction
          icon={<Crosshair />}
          label="Track"
          filled
          pressed={a.following}
          testId="airplane-track"
          // The pressed state says whether the map keeps it in sight (WAI-ARIA APG, Button);
          // the visible word in its name (WCAG 2.5.3).
          spoken={`Track ${title} on the map`}
        />
      }
    />
  ) : (
    <CardAction
      key="fly"
      icon={<ACTION.flyHere.icon />}
      label={a.flying ? "Flying This" : "Fly This"}
      spoken={a.flying ? "Flying this airplane" : "Fly this airplane"}
      filled
      disabled={a.flying || !a.flyable}
      onClick={a.fly}
      testId="fly-this-airplane"
    />
  );
  // Alerts by the ICAO address: greyed for an N-number the registry gives none.
  const alerts = hex ? (
    <AircraftAlertMenu
      key="alerts"
      hex={hex}
      name={title}
      airborne={a.airborne}
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
    <FavoriteTile key="favorite" on={a.starred} disabled={!a.kept} onToggle={a.toggleFavorite} testId="airplane-favorite" />,
    <CardAction
      key="figures"
      icon={<Gauge />}
      label="Figures"
      disabled={!a.flyable}
      onClick={a.openFigures}
      testId="airplane-figures-open"
    />,
  ];
  // Every tile 56 tall, as the airport card's are (PlaceActions).
  return (
    <div className="grid grid-cols-4 gap-2 *:min-h-14" data-testid="airplane-actions">
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
 * its state (Actions), its facts strip (AirplaneFacts). Then its two
 * tabs, the bar at its foot as the airport card's (the owner, 2026-11-27):
 * Info, where it opens, its pictures and record (InfoPage); Flights, its
 * flight now and its flights (FlightNowBox, FlightsPage), asked for in the
 * background as it opens. Its Figures a card of their own from its fourth
 * button (FiguresCard). Its POH, the pilot's own PDF (PohRow), on Figures,
 * else on Info. Its
 * view model is useAirplaneCardModel.
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
  // Its Figures open from the start where one of them was asked for.
  const m = useAirplaneCardModel({ tail, hex, figures: figures || !!focus });
  const { card, live, head, nav } = m;
  // Its POH on Figures, else on the page: one row.
  const poh = m.tail ? <PohRow tail={m.tail} model={m.pohModel} /> : null;
  return (
    <SheetCard head={false} onClose={head.close} testId="airplane-profile">
      {/* The airport card's head (CardTitle): Share at its start, its name
          with its call sign and what it is under it, ✕ at its end. */}
      <CardTitle
        title={head.title}
        sub={head.sub}
        onClose={head.close}
        onShare={head.share}
        testId="airplane-head"
        titleTestId="airplane-name"
        closeTestId="sheet-card-close"
        shareTestId="airplane-share"
      />
      <Actions m={m} />
      {live.waiting && (
        <p className={cn("pt-2 text-tint", TEXT.note)} data-testid="flight-alerts-set">
          {live.waiting}
        </p>
      )}
      {/* What it is in a sideways strip (type, year, seats, engines …, who
          flies it and its squawk) under its buttons and over its pictures
          (the owner, 2026-11-26: "It should be buttons, info strip and then
          the pictures"); for traffic with no N-number its own identifiers. */}
      <AirplaneFacts
        record={m.tail ? (card.details?.registration ?? card.record ?? live.detail?.faa ?? null) : null}
        model={m.tail ? card.details?.model : undefined}
        {...liveFacts(m.hex, live, !m.tail)}
        testId="airplane-facts"
      />
      {/* Two tabs in the glass bar at its foot, as the airport card's: Info,
          where it opens, and Flights (the owner, 2026-11-27). */}
      <CardTabPages
        tab={nav.tab}
        onPick={nav.pick}
        top={nav.setTop}
        bar={
          <CardTabBar<AirplaneTab>
            testId="airplane-tab-bar"
            tabTestId="airplane-tab-"
            onPick={nav.pick}
            tabs={[
              { value: "info", label: "Info", icon: Info },
              { value: "flights", label: "Flights", icon: History, hint: card.flightCount ? String(card.flightCount) : null },
            ]}
          />
        }
      >
        <CardTabPanel value="info">
          {/* Its photos and where it has flown (the owner, 2026-11-27: "info can show the pictures"). */}
          <FlightPictures
            live={live}
            title={head.title}
            photo={airplanePhotoSlide(m.tail, card.photo)}
            trafficPhoto={m.tail ? null : m.hex}
          />
          <InfoPage m={m} poh={m.actions.flyable ? null : poh} />
        </CardTabPanel>
        <CardTabPanel value="flights">
          {/* Its flight now, then its flights (the owner, 2026-11-27: "flights can show the in the air card"). */}
          <FlightNowBox
            live={live}
            title={head.title}
            onOpenAirport={nav.openAirport}
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
          <FlightsPage m={m} />
        </CardTabPanel>
      </CardTabPages>
      {nav.figuresOpen && <FiguresCard m={m} poh={poh} focus={focus} />}
    </SheetCard>
  );
}
