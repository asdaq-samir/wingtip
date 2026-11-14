import { cn } from "cn";
import { ListGroup, ListRow } from "../../GroupedList";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { declinationOf, fixRadialDistance, hoursOf, morseOf, radialOf, serviceVolume } from "../../../lib/navaid";
import { threeFigures } from "../../../lib/format";
import { TEXT } from "../../../lib/text";
import { feet } from "../../../lib/format";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { PointActions } from "./PointCardActions";
import type { FixPin, VorPin } from "../../../lib/map/sources/overlayTypes";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { degreesMinutes } from "../../../lib/coords";
import { BLUE } from "../../../lib/useAirspace";
import { nmAway, useAwayWords } from "../../../lib/useAway";
import { PointWhere } from "../../../lib/map/cards/PointWhere";
import { CHART } from "../../../lib/tokens";

/**
 * The cards a tap on a VOR or a low enroute chart fix opens (the map
 * draws them from the overlay tiles:
 * components/map/layers/NavaidsGl).
 */

/** A VOR's mark on its card: the sectional's blue hexagon. */
const HEXAGON = (
  <svg className="mx-1 shrink-0" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
    <polygon points="15,8 11.5,14.06 4.5,14.06 1,8 4.5,1.94 11.5,1.94" fill={CHART.casing} stroke={BLUE} strokeWidth="2" />
    <circle cx="8" cy="8" r="1.6" fill={BLUE} />
  </svg>
);
/** An enroute fix's on its card: the low chart's triangle, as the map's. */
const TRIANGLE = (
  <svg className="mx-1 shrink-0" width="16" height="16" viewBox="0 0 10 10" aria-hidden="true">
    <polygon points="5,1 9.4,8.8 0.6,8.8" fill={CHART.casing} stroke={CHART.fixInk} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

/** The chart's colours of the two marks, the ground of their cards' pill:
 *  the VOR's the map's own blue (airspaceMarks' vorIcon), where the card's
 *  was a shade deeper (the owner's pick, 2026-11-03). */
const VOR_BLUE = BLUE;
const FIX_INK = CHART.fixInk;

/** Made only once it is opened, so only an open card hears own ship. */
export function VorCard({ vor }: { vor: VorPin }) {
  const ship = useOwnFix();
  const away = useAwayWords(vor.lat, vor.lon);
  // The radial the airplane is on and the course back to the station, to
  // its own declination (lib/navaid): what the OBS is set to.
  const on = ship ? radialOf(vor, ship) : null;
  const volume = serviceVolume(vor.service_volume);
  const hours = hoursOf(vor.hours);
  return (
    <MapCard
      media={HEXAGON}
      title={
        <>
          {vor.ident}
          <span className="font-normal text-muted-foreground">{vor.kind}</span>
        </>
      }
      subtitle={[vor.name, vor.freq].filter(Boolean).join(" · ") || undefined}
      pill={{ name: `${vor.ident} ${vor.kind}`, line: [vor.freq, away ?? vor.name].filter(Boolean).join(" · "), colour: VOR_BLUE }}
    >
      <PointActions point={vor} copy={vor.freq ? { label: vor.freq, text: vor.freq } : null} />
      {on && (
        <p className={cn("tabular-nums", TEXT.row)} data-testid="vor-radial">
          <span className="font-semibold">On the {threeFigures(on.radial)} radial</span> · {nmAway(on.nm)}
          <span className={cn("block text-muted-foreground", TEXT.detail)}>{threeFigures(on.toCourse)}° to fly to it</span>
        </p>
      )}
      <ListGroup>
        {/* Its identifier as it sends it: the only sure way to know the
            station tuned is the one meant (AIM 1-1-3). */}
        <ListRow
          title="Identifier"
          value={
            <span className="font-semibold text-foreground" aria-label={[...vor.ident].join(" ")}>
              {morseOf(vor.ident)}
            </span>
          }
          data-testid="vor-morse"
        />
        {vor.channel && <ListRow title="DME channel" value={<span className="text-foreground">{vor.channel}</span>} />}
        {volume && <ListRow title="Service volume" description={volume} data-testid="vor-service-volume" />}
        {vor.elevation_ft != null && (
          <ListRow title="Elevation" value={<span className="text-foreground">{feet(vor.elevation_ft)}</span>} />
        )}
        {vor.mag_var != null && (
          <ListRow title="Declination" value={<span className="text-foreground">{declinationOf(vor.mag_var)}</span>} />
        )}
        {hours && <ListRow title="Hours" value={<span className="text-foreground">{hours}</span>} />}
      </ListGroup>
      {/* Where its signal is not to be used, as the Chart Supplement lists
          it (NASR NAV_RMK): in the caution colour where it is in service
          with restrictions. */}
      {/* Folded under a row of their own, as the airport card's fuel
          remarks are: a busy station's run to a screenful (STL's). */}
      {(vor.remarks ?? []).length > 0 && (
        <ListGroup>
          <Collapsible>
            <CollapsibleTrigger
              render={
                <ListRow
                  title={<span className={cn(vor.restricted && "text-caution")}>{vor.restricted ? "Restrictions" : "Remarks"}</span>}
                  chevron
                  data-testid="vor-remarks"
                />
              }
            />
            <CollapsibleContent>
              {(vor.remarks ?? []).map((remark) => (
                <ListRow
                  key={remark}
                  title={<span className={cn("text-muted-foreground", TEXT.detail)}>{remark}</span>}
                  data-testid="vor-remark"
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </ListGroup>
      )}
      <PointWhere lat={vor.lat} lon={vor.lon} />
    </MapCard>
  );
}

export function FixCard({ fix, vors }: { fix: FixPin; vors: readonly VorPin[] }) {
  const away = useAwayWords(fix.lat, fix.lon);
  // Where it is off the nearest VOR in view, as a controller says it.
  const frd = fixRadialDistance(fix, vors);
  return (
    <MapCard
      media={TRIANGLE}
      title={
        <>
          {fix.ident}
          <span className="font-normal text-muted-foreground">Fix</span>
        </>
      }
      subtitle={frd ?? undefined}
      pill={{ name: `${fix.ident} fix`, line: frd ?? away ?? degreesMinutes(fix), colour: FIX_INK }}
    >
      <PointActions point={fix} copy={null} />
      <PointWhere lat={fix.lat} lon={fix.lon} />
    </MapCard>
  );
}
