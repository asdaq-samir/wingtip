import { ListGroup, ListRow } from "../../components/GroupedList";
import { requestAirplanePick } from "../../lib/pickAirplane";
import type { EmergencyModel } from "./useEmergency";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * With no airplane picked, in the checklist's place: the general guidance
 * the AIM and the Airplane Flying Handbook give any pilot (the engine's
 * emergency_guidance), each with its source, and "Pick an airplane" for
 * its own checklist and glide -- never another airplane's checklist or
 * figures (the owner, 2026-11-09).
 */
export default function GuidanceList({ vm }: { vm: EmergencyModel }) {
  if (!vm.guidance) return null;
  return (
    <ListGroup title="What to Do">
      {vm.guidance.map((g) => (
        <ListRow key={g.title} title={g.title} description={`${g.detail} (${g.source})`} />
      ))}
      <ListRow
        title={WORDING.pickAnAirplane}
        description="For its own checklist and glide"
        onClick={() => {
          vm.close();
          requestAirplanePick();
        }}
      />
    </ListGroup>
  );
}
