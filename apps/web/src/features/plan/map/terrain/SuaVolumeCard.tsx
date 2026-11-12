import { ShieldAlert } from "lucide-react";
import { cn } from "cn";
import { RowBadge } from "../../../../components/RowBadge";
import { faaWords, suaAltitudes } from "../../../../lib/advisories";
import { MapCard } from "../../../../lib/map/cards/MapCard";
import { TEXT } from "../../../../lib/text";
import type { SuaTileArea } from "./tileVolumes";

/**
 * The card a tap on a special use area's volume opens in 3D: its name and
 * kind, its altitudes as the engine writes them (sua_altitudes: a floor
 * above the ground said so), when it is used and who controls it -- what
 * the held point's card (features/plan/components/AirspaceCard) says of
 * the same area, in the area's own ink.
 */
export function SuaVolumeCard({ area, colour }: { area: SuaTileArea; colour: string }) {
  const name = faaWords(area.name);
  const kind = area.kind ? area.kind[0]!.toUpperCase() + area.kind.slice(1) : "Special use airspace";
  const rows: [string, string][] = [["Altitudes", suaAltitudes(area)]];
  if (area.times_of_use) rows.push(["In use", faaWords(area.times_of_use)]);
  if (area.controlling_agency) rows.push(["Controlled by", faaWords(area.controlling_agency)]);
  return (
    <MapCard
      media={
        <RowBadge colour={colour}>
          <ShieldAlert />
        </RowBadge>
      }
      title={name}
      subtitle={kind}
      pill={{ name, line: kind, colour }}
    >
      <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left", TEXT.row)} data-testid="sua-card">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </MapCard>
  );
}
