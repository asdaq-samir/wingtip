import { useMemo } from "react";
import { cn } from "cn";
import { areaFrom, lineEnters, outsides } from "../lib/areaPlace";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { useGeo } from "../../../lib/geo";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { Ban } from "lucide-react";
import { RowBadge } from "../../../components/RowBadge";
import { BADGE } from "../../../lib/rowBadges";
import { faaWords, tfrAltitudes, tfrPage, tfrTimes } from "../../../lib/advisories";
import type { Tfr } from "../../../lib/api/types";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { TFR_RED } from "./tfrMarks";

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
  return (
    <MapCard
      // A TFR's badge, red while it is in force, as its shape is drawn.
      media={
        <RowBadge colour={active ? TFR_RED : BADGE.other}>
          <Ban />
        </RowBadge>
      }
      title={`TFR ${tfr.notam_id}`}
      subtitle={[tfr.kind, active ? "In force now" : "Not yet in force"].filter(Boolean).join(" · ")}
    >
      <div className="space-y-1 text-left" data-testid="tfr-card">
        {tfrAltitudes(tfr) && <p>{tfrAltitudes(tfr)}</p>}
        {tfrTimes(tfr) && <p>{tfrTimes(tfr)}</p>}
        {/* The FAA's capitals in sentence case, its codes kept (faaWords),
            as the Brief sets the same TFR's purpose. */}
        {(tfr.purpose ?? tfr.rule) && <p className="text-muted-foreground">{faaWords(tfr.purpose ?? tfr.rule)}</p>}
        {/* Where it is to the pilot, at the owner's ask for cards that
            say what a pilot does there (2026-10-30): whether the route
            goes through it, and how far it is. */}
        {rings.length > 0 && line && (
          <p className={cn(enters ? "font-semibold text-caution-ink" : "text-muted-foreground")} data-testid="tfr-route">
            {enters ? "Your route goes through it" : "Clear of your route"}
          </p>
        )}
        {from && <p data-testid="tfr-from">{from}</p>}
        <a className="text-tint" href={tfrPage(tfr.notam_id)} target="_blank" rel="noreferrer">
          The NOTAM on tfr.faa.gov
        </a>
      </div>
    </MapCard>
  );
}
