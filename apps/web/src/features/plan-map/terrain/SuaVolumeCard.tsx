import { TermTable } from "../../../components/CardFacts";
import { faaWords, suaAltitudes } from "../../../lib/advisories";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { TEXT } from "../../../lib/text";
import type { SuaArea } from "./airspaceVolumes";
import { capitalised } from "../../../lib/capitals";

/**
 * The card a tap on a special use area's volume opens in 3D: its name and
 * kind, its altitudes as the engine writes them (sua_altitudes: a floor
 * above the ground said so), when it is used and who controls it -- what
 * the held point's card (features/place/AirspaceCard) says of
 * the same area.
 */
export function SuaVolumeCard({ area }: { area: SuaArea }) {
  const name = faaWords(area.name);
  const kind = area.kind ? capitalised(area.kind) : "Special use airspace";
  const rows: [string, string][] = [["Altitudes", suaAltitudes(area)]];
  if (area.times_of_use) rows.push(["In use", faaWords(area.times_of_use)]);
  if (area.controlling_agency) rows.push(["Controlled by", faaWords(area.controlling_agency)]);
  return (
    // Its name, and its kind under it, as every card's head; no badge
    // before the name, which the head has no place for.
    <MapCard title={name} subtitle={kind}>
      <TermTable rows={rows} className={TEXT.row} />
    </MapCard>
  );
}
