import { ListGroup } from "../../components/GroupedList";
import SwitchRow from "../../components/SwitchRow";
import { EXTRAS, useExtras } from "../../lib/extras";

/** The parked features, a switch each, all off until turned on (the
 *  feature review, taken by the owner 2026-11-21; lib/extras): kept in the
 *  app but out of a pilot's way and out of the store listing. */
export default function ExtrasGroup() {
  const extras = useExtras();
  return (
    <ListGroup title="Extras">
      {EXTRAS.map((e) => (
        <SwitchRow
          key={e.key}
          title={e.title}
          description={e.description}
          on={extras[e.key]}
          onChange={(on) => extras.set(e.key, on)}
          testId={`extras-${e.key}`}
        />
      ))}
    </ListGroup>
  );
}
