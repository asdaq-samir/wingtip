import { SheetCard } from "../../components/SheetCard";
import ActionsList from "./ActionsList";
import DirectToField from "./DirectToField";
import EmergencyChecklist from "./EmergencyChecklist";
import FieldsList from "./FieldsList";
import GuidanceList from "./GuidanceList";
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
 * checklists. The one full-screen card of the one card rule (the owner,
 * 2026-11-10): the map's sheet all the way up for it, on a phone as in a
 * desktop's side panel at its full height, over the search, its ✕ at the
 * top right where every card's is. Not a modal and nothing dimmed, where
 * on a phone it was a dimmed sheet: the line to the field picked is drawn
 * on the map, which the sheet let down shows and a desktop keeps beside
 * it (docs/design/web.md §8). Its head takes the first focus (the APG
 * dialog's static title), so a screen reader starts at "Emergency" and
 * the next Tab after the close is Direct To.
 *
 * It opens at once, whatever the motion setting (docs/design/web.md §8):
 * the stylesheet below takes the sheet's entry transition away for this
 * sheet alone, as a pilot in trouble should not
 * wait 0.3 s for a slide. React puts the <style> in the head while the
 * sheet is open (React 19's hoisted style, by its href).
 */
export default function EmergencySheet() {
  const vm = useEmergency();
  return (
    <SheetCard title="Emergency" onClose={vm.close} fullScreen testId="emergency-sheet">
      <style href="wingtip-emergency-at-once" precedence="default">
        {`[data-testid="emergency-sheet"] { transition: none !important; animation: none !important; }`}
      </style>
      <div className="grid gap-4">
        <DirectToField vm={vm} />
        <FieldsList vm={vm} />
        {vm.guidance ? <GuidanceList vm={vm} /> : <EmergencyChecklist vm={vm} />}
        <ActionsList vm={vm} />
      </div>
    </SheetCard>
  );
}
