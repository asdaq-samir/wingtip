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
import { nmAway } from "../../../lib/useAway";
import { PointWhere } from "../../../lib/map/cards/PointWhere";
import { CardShareButton } from "../../CardHead";
import { markLink, navaidLink } from "../../../lib/address";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { useRingWhileUp } from "../../../lib/map/mapPick";
import { shareOrCopy } from "../../../lib/share";
import { mhzText } from "../../../lib/frequencies";

/**
 * The cards a tap on a VOR or a low enroute chart fix opens (the map
 * draws them from the overlay tiles:
 * components/map/layers/NavaidsGl).
 */

/** Made only once it is opened, so only an open card hears own ship. */
export function VorCard({ vor }: { vor: VorPin }) {
  const ship = useOwnFix();
  // Its ring on the map while its card is up (the one selection ring).
  useRingWhileUp(vor);
  // The radial the airplane is on and the course back to the station, to
  // its own declination (lib/navaid): what the OBS is set to.
  const on = ship ? radialOf(vor, ship) : null;
  const volume = serviceVolume(vor.service_volume);
  const hours = hoursOf(vor.hours);
  // Its frequency as a radio's dial shows it, "113.0" where NASR files
  // "113" (NAV_BASE FREQ, MHz).
  const freq = vor.freq && Number.isFinite(Number(vor.freq)) ? mhzText(Number(vor.freq)) : vor.freq;
  // Its link, which opens this card (`navaid=`), shared where the device
  // can, copied where not, as every card's Share is.
  const share = () =>
    void shareOrCopy({ title: `${vor.ident} ${vor.kind}`, url: navaidLink(vor, location.origin) }).catch(() => {
      /* put away, or not allowed: nothing to say */
    });
  return (
    // Its head as every card's (the card rule's 8): Share at the start, its
    // name centred with its line under it, the close at the end; no
    // hexagon before the name, which the head has no place for (the
    // owner's iPhone, 2026-11-14, OBK's card). Its ident the name, what it
    // is and its frequency the line ("OBK" / "VORTAC · 113.0", the owner,
    // 2026-11-18), its own name after them.
    <MapCard
      start={<CardShareButton onShare={share} />}
      title={vor.ident}
      subtitle={[vor.kind, freq, vor.name].filter(Boolean).join(" · ")}
    >
      {/* Direct To, Add to Route and its frequency to copy, a full row
          (PointActions); no Favorite, as the Favorites hold airports and
          airplanes only (lib/preferences). */}
      <PointActions point={vor} copy={freq ? { label: freq, text: freq } : null} />
      {on && (
        <p className={cn("tabular-nums", TEXT.row)}>
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
                />
              }
            />
            <CollapsibleContent>
              {(vor.remarks ?? []).map((remark) => (
                <ListRow key={remark} title={<span className={cn("text-muted-foreground", TEXT.detail)}>{remark}</span>} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </ListGroup>
      )}
      <PointWhere lat={vor.lat} lon={vor.lon} />
    </MapCard>
  );
}

/** An enroute fix's card: its ident, and what it is and where it is off
 *  the nearest VOR in view, as a controller says it, under it ("BXCMB" /
 *  "Fix · JOT 045° 12 nm"); its link (`mark`) for its Share. */
export function FixCard({ fix }: { fix: FixPin }) {
  const stations = usePointActions((s) => s.stations);
  const frd = fixRadialDistance(fix, stations);
  useRingWhileUp(fix);
  const share = () =>
    void shareOrCopy({ title: fix.ident, url: markLink({ kind: "fix", ...fix }, location.origin) }).catch(() => {
      /* put away, or not allowed: nothing to say */
    });
  return (
    <MapCard start={<CardShareButton onShare={share} />} title={fix.ident} subtitle={["Fix", frd].filter(Boolean).join(" · ")}>
      <PointActions point={fix} copy={null} />
      <PointWhere lat={fix.lat} lon={fix.lon} />
    </MapCard>
  );
}
