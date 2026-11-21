import { useQuery } from "@tanstack/react-query";
import type { AirspaceVolume } from "../../../lib/map/sources/overlayTypes";
import { TEXT } from "../../../lib/text";
import { TermTable } from "../../CardFacts";
import { airspaceFacts } from "../../../lib/map/marks/airspaceLabel";
import { CardShareButton } from "../../CardHead";
import { markLink } from "../../../lib/address";
import { shareOrCopy } from "../../../lib/share";
import { useAreaWhileUp } from "../../../lib/map/mapPick";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { ListGroup, ListRow } from "../../GroupedList";
import { callTypes, entryRules, specialVfr } from "../../../lib/airspaceRules";
import FrequencyButton from "../../FrequencyButton";
import { airportQuery } from "../../../lib/queryClient";
import { Cited } from "../../../features/documents";

/**
 * The card a tap on a Class B, C or D line opens (the map draws them from
 * the overlay tiles: components/map/layers/AirspaceGl):
 * each volume's line from the FAA's own airspace file -- the one the
 * chart is drawn from -- with its altitudes, and its card: its class,
 * name, floor, ceiling and hours, who to call and what it takes to go in
 * (the owner, 2026-10-29: "make the airspace rings selectable with more
 * info").
 */

/** A volume's card on whichever map opened it: its name the card's, its
 *  class the line under it ("Chicago Class B" / "Class B", the owner,
 *  2026-11-18: the title is the thing's name, the line its kind), its edge
 *  lit while it is up (AirspaceGl), and its link (`mark`, by its number in
 *  the tiles and where it was tapped, `at`) for its Share. */
export function AirspaceCardBody({ volume, at }: { volume: AirspaceVolume; at?: { lat: number; lon: number } }) {
  const facts = airspaceFacts(volume);
  useAreaWhileUp({ kind: "airspace", id: volume.id });
  const number = volume.id.startsWith("tile-") ? volume.id.slice(5) : null;
  const share =
    at && number && /^[A-Z0-9-]{1,12}$/.test(number)
      ? () =>
          void shareOrCopy({ title: facts.name, url: markLink({ kind: "airspace", ident: number, ...at }, location.origin) }).catch(() => {
            /* put away, or not allowed: nothing to say */
          })
      : undefined;
  const rows: [string, string][] = [
    ["Floor", facts.floor],
    ["Ceiling", facts.ceiling],
  ];
  if (facts.hours) rows.push(["Hours", facts.hours]);
  return (
    <MapCard
      start={share && <CardShareButton onShare={share} />}
      title={facts.name || `Class ${volume.airspace_class}`}
      subtitle={`Class ${volume.airspace_class}`}
    >
      <TermTable rows={rows} testId="airspace-card" className={TEXT.row} ddClassName="tabular-nums" />
      <AirspaceCall volume={volume} />
      {/* What it takes to go in, each rule with its section (lib/airspaceRules),
          at the owner's ask for cards that say what a pilot does there
          (2026-10-30). */}
      <div>
        <ListGroup title="To enter">
          {entryRules(volume.airspace_class).map((r) => (
            <ListRow key={r.rule} title={<span className={TEXT.detail}>{r.rule}</span>} description={<Cited text={r.cite} />} />
          ))}
        </ListGroup>
      </div>
      {volume.floor_sfc && <SpecialVfr volume={volume} />}
    </MapCard>
  );
}

/** Special VFR in the surface area, the part of a volume from the
 *  surface (14 CFR 91.157(a)): what it asks, or why an airplane may not
 *  fly it at this airport (part 91 appendix D, section 3). */
function SpecialVfr({ volume }: { volume: AirspaceVolume }) {
  const svfr = specialVfr(volume.airspace_class, volume.ident);
  return (
    <div data-testid="airspace-special-vfr">
      <ListGroup title={svfr.available ? "Special VFR" : "No special VFR"}>
        {svfr.lines.map((r) => (
          <ListRow key={r.words} title={<span className={TEXT.detail}>{r.words}</span>} description={r.source} />
        ))}
      </ListGroup>
    </div>
  );
}

/** Who to call before entering, from the primary airport's frequencies
 *  (NASR FRQ): its approach control for a Class B or C, its tower for a
 *  Class D; the first three. */
function AirspaceCall({ volume }: { volume: AirspaceVolume }) {
  const { data: field } = useQuery({ ...airportQuery(volume.ident ?? ""), enabled: !!volume.ident });
  const types = callTypes(volume.airspace_class);
  const calls = (field?.frequencies ?? []).filter((f) => f.frequency_mhz != null && types.includes((f.type ?? "").toUpperCase()));
  // Approach where it has one, else the tower.
  const first = types.find((type) => calls.some((f) => f.type?.toUpperCase() === type));
  const shown = calls.filter((f) => f.type?.toUpperCase() === first).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div>
      <ListGroup title={first === "APP" ? "Call approach" : "Call the tower"}>
        {shown.map((f, i) => (
          <ListRow
            key={`${f.frequency_mhz}-${i}`}
            title={<span className={TEXT.detail}>{f.description ?? f.type}</span>}
            value={<FrequencyButton mhz={f.frequency_mhz!} name={f.description ?? f.type ?? undefined} />}
          />
        ))}
      </ListGroup>
    </div>
  );
}
