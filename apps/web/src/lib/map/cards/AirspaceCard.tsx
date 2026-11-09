import { useQuery } from "@tanstack/react-query";
import type { AirspaceVolume } from "../sources/overlayTypes";
import { cn } from "cn";
import { TEXT } from "../../text";
import { airspaceFacts } from "../marks/airspaceLabel";
import { AIRSPACE_LINE } from "../marks/airspaceMarks";
import { MapCard } from "./MapCard";
import { Button } from "../../../components/ui/button";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { callTypes, entryRules } from "../../airspaceRules";
import { mhzText } from "../../frequencies";
import { airportQuery } from "../../queryClient";
import { usePointActions } from "./pointActions";

/**
 * The card a tap on a Class B, C or D line opens (the map draws them from
 * the overlay tiles: lib/map/gl/layers/AirspaceGl):
 * each volume's line from the FAA's own airspace file -- the one the
 * chart is drawn from -- with its altitudes, and its card: its class,
 * name, floor, ceiling and hours, who to call and what it takes to go in
 * (the owner, 2026-10-29: "make the airspace rings selectable with more
 * info").
 */

/** A short length of the volume's line as the map draws it, before its
 *  title: solid blue, solid magenta or dashed blue. */
function Swatch({ volume }: { volume: AirspaceVolume }) {
  const line = AIRSPACE_LINE[volume.airspace_class];
  return (
    <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="mx-1 shrink-0">
      <line x1="0" y1="4" x2="28" y2="4" stroke={line.color} strokeWidth={line.weight} strokeDasharray={typeof line.dashArray === "string" ? line.dashArray : undefined} />
    </svg>
  );
}

/** A volume's card on whichever map opened it: `close` puts it away
 *  before the route is planned round the Class B (Leaflet's popup here,
 *  the WebGL map's sheet card in GlMap). */
export function AirspaceCardBody({ volume, close }: { volume: AirspaceVolume; close: () => void }) {
  const avoid = usePointActions(s => s.avoidClassB);
  const facts = airspaceFacts(volume);
  const rows: [string, string][] = [["Floor", facts.floor], ["Ceiling", facts.ceiling]];
  if (facts.hours) rows.push(["Hours", facts.hours]);
  return (
    <MapCard
      media={<Swatch volume={volume} />} title={`Class ${volume.airspace_class}`} subtitle={facts.name}
      // In the pill its name and place on the ring's own colour, as an
      // airport's is its picture (MapCard's `pill`).
      pill={{ name: `Class ${volume.airspace_class}`, line: facts.name, colour: AIRSPACE_LINE[volume.airspace_class].color }}
    >
      <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left", TEXT.row)} data-testid="airspace-card">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <AirspaceCall volume={volume} />
      {/* What it takes to go in, each rule with its section (lib/airspaceRules),
          at the owner's ask for cards that say what a pilot does there
          (2026-10-30). */}
      <div data-testid="airspace-rules">
        <ListGroup title="To enter">
          {entryRules(volume.airspace_class).map(r => (
            <ListRow key={r.rule} title={<span className={TEXT.detail}>{r.rule}</span>} description={r.cite} />
          ))}
        </ListGroup>
      </div>
      {volume.airspace_class === "B" && avoid && (
        <Button type="button" variant="secondary" className="w-full text-tint" onClick={() => { close(); avoid(); }} data-testid="airspace-avoid">
          Route Around Class B
        </Button>
      )}
    </MapCard>
  );
}

/** Who to call before entering, from the primary airport's frequencies
 *  (NASR FRQ): its approach control for a Class B or C, its tower for a
 *  Class D; the first three. */
function AirspaceCall({ volume }: { volume: AirspaceVolume }) {
  const { data: field } = useQuery({ ...airportQuery(volume.ident ?? ""), enabled: !!volume.ident });
  const types = callTypes(volume.airspace_class);
  const calls = (field?.frequencies ?? []).filter(f => f.frequency_mhz != null && types.includes((f.type ?? "").toUpperCase()));
  // Approach where it has one, else the tower.
  const first = types.find(type => calls.some(f => f.type?.toUpperCase() === type));
  const shown = calls.filter(f => f.type?.toUpperCase() === first).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div data-testid="airspace-call">
      <ListGroup title={first === "APP" ? "Call approach" : "Call the tower"}>
        {shown.map((f, i) => (
          <ListRow
            key={`${f.frequency_mhz}-${i}`} title={<span className={TEXT.detail}>{f.description ?? f.type}</span>}
            value={<span className="font-semibold text-foreground tabular-nums">{mhzText(f.frequency_mhz!)}</span>}
          />
        ))}
      </ListGroup>
    </div>
  );
}

