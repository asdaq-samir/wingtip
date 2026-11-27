import { Bell, Crosshair, Gauge, Share } from "lucide-react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import { SheetCard } from "../../components/SheetCard";
import { CardAction } from "../../components/CardAction";
import IconButton from "../../components/IconButton";
import { ACTION } from "../../lib/cardActions";
import AircraftAlertMenu from "../../components/airplane/AircraftAlertMenu";
import { FavoriteTile } from "../../components/FavoriteTile";
import { StatusLine } from "../../components/StatusBadge";
import type { FigureKey } from "../../lib/airplane/figures";
import { TEXT } from "../../lib/text";
import { PohRow } from "../documents/lazy";
import { FlightPictures, liveFacts } from "../traffic/lazy";
import { AirplaneFacts } from "../../components/airplane/AirplaneFacts";
import { useAirplaneCardModel, type AirplaneCardModel } from "./useAirplaneCardModel";
import AirplanePage from "./AirplanePage";
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
  ) : (
    <CardAction
      key="fly"
      icon={<ACTION.flyHere.icon />}
      label={vm.flying ? "Flying This" : "Fly This"}
      spoken={vm.flying ? "Flying this airplane" : "Fly this airplane"}
      filled
      disabled={vm.flying || !m.flyable}
      onClick={m.fly}
      testId="fly-this-airplane"
    />
  );
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
    <CardAction
      key="figures"
      icon={<Gauge />}
      label="Figures"
      disabled={!m.flyable}
      onClick={m.openFigures}
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
 * its state (Actions). Under them one sideways row of slides
 * (FlightPictures): its flight while it flies, else one line of where it
 * last landed; its photos; the sketch of where it has flown. Then one
 * page, no tab bar (AirplanePage): Now, its record, its flights. Its
 * Figures a card of their own from its fourth button (FiguresCard). Its
 * POH, the pilot's own PDF (PohRow), on Figures, else on the page. Its
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
  const { card, live } = m;
  // Its POH on Figures, else on the page: one row.
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
    >
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
      <AirplanePage m={m} poh={m.flyable ? null : poh} />
      {m.figuresOpen && <FiguresCard m={m} poh={poh} focus={focus} />}
    </SheetCard>
  );
}
