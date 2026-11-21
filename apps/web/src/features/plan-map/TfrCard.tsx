import { useMemo } from "react";
import { cn } from "cn";
import { areaFrom, lineEnters, outsides } from "./areaPlace";
import { useOwnFix } from "../../lib/map/position/ownShip";
import { useGeo } from "../../lib/geo";
import { usePointActions } from "../../lib/map/cards/pointActions";
import { CardShareButton } from "../../components/CardHead";
import { tfrAltitudes, tfrPage, tfrPurpose, tfrTimes } from "../../lib/advisories";
import type { Tfr } from "../../lib/api/types";
import { MapCard } from "../../lib/map/cards/MapCard";
import { shareOrCopy } from "../../lib/share";
import { tfrLink } from "../../lib/address";
import StatusBadge from "../../components/StatusBadge";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * A temporary flight restriction's card (the map draws them, in tfrMarks'
 * ink: features/plan-map/layers/TfrGl).
 */

export function TfrCard({ tfr, active }: { tfr: Tfr; active: boolean }) {
  const rings = useMemo(() => outsides(tfr.geometry as { type?: string; coordinates?: unknown }), [tfr.geometry]);
  const line = usePointActions((s) => s.courseLine);
  const enters = useMemo(() => !!line && rings.length > 0 && lineEnters(rings, line), [rings, line]);
  const ship = useOwnFix();
  const geo = useGeo();
  const from = ship && geo ? areaFrom(geo, rings, ship) : null;
  // Its NOTAM number the name, what it is under it ("4/1234" / "TFR ·
  // VIP", the owner, 2026-11-18: the title is the thing's ident, the line
  // its kind and details).
  const title = tfr.notam_id;
  // Its link, which opens this card (`tfr=`), shared where the device can,
  // copied where not, as every card's Share is.
  const share = () =>
    void shareOrCopy({ title: `TFR ${title}`, url: tfrLink(tfr.notam_id, location.origin) }).catch(() => {
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
      // Its kind, and whether it is in force now, a badge beside it (the
      // owner, 2026-11-14: "Use badges where we can for example tfr
      // active"): Active, or Later before it starts.
      subtitle={
        <span className="inline-flex items-center gap-2">
          {["TFR", tfr.kind].filter(Boolean).join(" · ")}
          <StatusBadge variant={active ? "active" : "later"} data-testid={`status-${active ? "active" : "later"}`} />
        </span>
      }
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
          <p className={cn(enters && "font-semibold text-caution-ink")}>{enters ? "Your route goes through it" : "Clear of your route"}</p>
        )}
        {from && <p>{from}</p>}
        {/* Its 44-point area from the link's own line, nothing grown. */}
        <a className="relative block w-fit text-tint hit-y-3" href={tfrPage(tfr.notam_id)} target="_blank" rel="noreferrer">
          The NOTAM on tfr.faa.gov
        </a>
      </div>
    </MapCard>
  );
}

/** A TFR's card opened by a link to one tfr.faa.gov no longer lists (it
 *  has ended or been cancelled), or with the list not come in: said in
 *  the card, its NOTAM's page still there to look at. */
export function TfrGone({ notamId, failed }: { notamId: string; failed: boolean }) {
  return (
    <MapCard title={notamId} subtitle="TFR">
      <div className="space-y-1 text-left">
        <p>{failed ? WORDING.tfrsNotLoaded : "Not on tfr.faa.gov's list now: ended or cancelled."}</p>
        <a className="relative block w-fit text-tint hit-y-3" href={tfrPage(notamId)} target="_blank" rel="noreferrer">
          The NOTAM on tfr.faa.gov
        </a>
      </div>
    </MapCard>
  );
}
