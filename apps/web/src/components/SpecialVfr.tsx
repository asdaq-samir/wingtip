import { ListGroup, ListRow } from "./GroupedList";
import { specialVfr } from "../lib/airspaceRules";
import { TEXT } from "../lib/text";

/** Special VFR in a Class B, C or D surface area (14 CFR 91.157(a)):
 *  what it asks, or why an airplane may not fly it at the area's primary
 *  airport (part 91 appendix D, section 3), as the engine says
 *  (`special_vfr`). The airspace volume's card (map/cards/AirspaceCard)
 *  and a held point's (features/place/AirspaceCard) alike. */
export function SpecialVfr({ airspaceClass, airport, testId }: { airspaceClass: "B" | "C" | "D"; airport: string | null; testId: string }) {
  const svfr = specialVfr(airspaceClass, airport);
  return (
    <div data-testid={testId}>
      <ListGroup title={svfr.available ? "Special VFR" : "No special VFR"}>
        {svfr.lines.map((r) => (
          <ListRow key={r.words} title={<span className={TEXT.detail}>{r.words}</span>} description={r.source} />
        ))}
      </ListGroup>
    </div>
  );
}
