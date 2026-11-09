import SheetDialog from "../../components/SheetDialog";
import ActionsList from "./ActionsList";
import EmergencyChecklist from "./EmergencyChecklist";
import FieldsList from "./FieldsList";
import { useEmergency } from "./useEmergency";

/**
 * The emergency assistant, one screen (the market gap: Garmin's Emergency
 * Autoland flies itself, ForeFlight's Nearest and glide ring list and
 * draw; neither puts the fields ranked by reach and runway, the
 * airplane's own checklist and the filled-in MAYDAY together): the best
 * fields within a glide with the line to the one picked on the map, the
 * checklist, and the radio. Opened with no map button of its own (the
 * owner, 2026-11-08) -- from the flying mode's Emergency, the pilot's
 * words ("mayday", "engine failure", "emergency") and the emergency
 * checklists -- the stock sheet (SheetDialog) over the map, which stays
 * in sight above it on a phone.
 */
export default function EmergencySheet() {
  const vm = useEmergency();
  return (
    <SheetDialog
      open={!!vm.open}
      onOpenChange={(open) => {
        if (!open) vm.close();
      }}
      title={<span className="text-destructive">Emergency</span>}
      testId="emergency-sheet"
    >
      <FieldsList vm={vm} />
      <EmergencyChecklist vm={vm} />
      <ActionsList vm={vm} />
    </SheetDialog>
  );
}
