import { useMemo } from "react";
import { cn } from "cn";
import { areaFrom, lineEnters, outsides } from "../lib/areaPlace";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { useGeo } from "../../../lib/geo";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { CardShareButton } from "../../../components/CardHead";
import { tfrAltitudes, tfrPage, tfrPurpose, tfrTimes } from "../../../lib/advisories";
import type { Tfr } from "../../../lib/api/types";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { shareOrCopy } from "../../../lib/share";

/**
 * A temporary flight restriction's card (the map draws them, in tfrMarks'
 * ink: features/plan/map/layers/TfrGl).
 */

export function TfrCard({ tfr, active }: { tfr: Tfr; active: boolean }) {
  const rings = useMemo(() => outsides(tfr.geometry as { type?: string; coordinates?: unknown }), [tfr.geometry]);
  const line = usePointActions((s) => s.courseLine);
  const enters = useMemo(() => !!line && rings.length > 0 && lineEnters(rings, line), [rings, line]);
  const ship = useOwnFix();
  const geo = useGeo();
  const from = ship && geo ? areaFrom(geo, rings, ship) : null;
  const title = `TFR ${tfr.notam_id}`;
  // Its link, shared where the device can, copied where not, as every
  // card's Share is: the FAA's own page for it, which anyone it is sent to
  // can open (the app's links name no TFR).
  const share = () =>
    void shareOrCopy({ title, url: tfrPage(tfr.notam_id) }).catch(() => {
      /* put away, or not allowed: nothing to say */
    });
  const purpose = tfrPurpose(tfr);
  return (
    // Its head as every card's (the card rule's 8): Share at the start,
    // its name centred with its line under it, the close at the end. No
    // badge before the name: the head has no place for one, as the
    // airport card's has none, and its kind is in the line (the owner's
    // iPhone, 2026-11-14).
    <MapCard
      start={<CardShareButton onShare={share} />}
      title={title}
      subtitle={[tfr.kind, active ? "In force now" : "Not yet in force"].filter(Boolean).join(" · ")}
    >
      <div className="space-y-1 text-left" data-testid="tfr-card">
        {tfrAltitudes(tfr) && <p>{tfrAltitudes(tfr)}</p>}
        {tfrTimes(tfr) && <p data-testid="tfr-times">{tfrTimes(tfr)}</p>}
        {/* Its purpose, or the rule it is under with its section ("Special
            security instructions, 14 CFR 99.7", tfrPurpose): a line of the
            card's like the rest, not a grey note under them. */}
        {purpose && <p data-testid="tfr-purpose">{purpose}</p>}
        {/* Where it is to the pilot, at the owner's ask for cards that
            say what a pilot does there (2026-10-30): whether the route
            goes through it, and how far it is. */}
        {rings.length > 0 && line && (
          <p className={cn(enters && "font-semibold text-caution-ink")} data-testid="tfr-route">
            {enters ? "Your route goes through it" : "Clear of your route"}
          </p>
        )}
        {from && <p data-testid="tfr-from">{from}</p>}
        {/* Its 44-point area from the link's own line, nothing grown. */}
        <a
          className="relative block w-fit text-tint after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
          href={tfrPage(tfr.notam_id)}
          target="_blank"
          rel="noreferrer"
        >
          The NOTAM on tfr.faa.gov
        </a>
      </div>
    </MapCard>
  );
}
