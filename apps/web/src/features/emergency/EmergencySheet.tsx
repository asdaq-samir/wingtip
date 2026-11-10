import PanelOrSheet from "../../components/PanelOrSheet";
import ActionsList from "./ActionsList";
import DirectToField from "./DirectToField";
import EmergencyChecklist from "./EmergencyChecklist";
import FieldsList from "./FieldsList";
import GuidanceList from "./GuidanceList";
import { useEmergency } from "./useEmergency";

/** The title the sheet opens on (APG modal dialog: a static title takes
 *  the first focus where the content is long), so a screen reader starts
 *  at "Emergency" and the next Tab is Direct To. The side panel's card
 *  focuses its own head the same way. */
const TITLE = "[data-emergency-title]";

/**
 * The emergency assistant, one screen (the market gap: Garmin's Emergency
 * Autoland flies itself, ForeFlight's Nearest and glide ring list and
 * draw; neither puts the fields ranked by reach and runway, the
 * airplane's own checklist and the filled-in MAYDAY together): the best
 * fields within a glide with the line to the one picked on the map, the
 * checklist, and the radio. Opened with no map button of its own (the
 * owner, 2026-11-08) -- from the flying mode's Emergency, the pilot's
 * words ("mayday", "engine failure", "emergency") and the emergency
 * checklists. On a phone the stock sheet over the map, which stays in
 * sight above it; from `md` up a card in the side panel at its full
 * height, no modal, the map usable beside it (docs/design/web.md §8,
 * PanelOrSheet).
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
    <PanelOrSheet
      open={!!vm.open}
      onClose={vm.close}
      name="Emergency"
      title={
        <span className="text-destructive outline-none" tabIndex={-1} data-emergency-title="">
          Emergency
        </span>
      }
      titleFocus={TITLE}
      raise="full"
      testId="emergency-sheet"
    >
      <style href="wingtip-emergency-at-once" precedence="default">
        {`[data-testid="emergency-sheet"] { transition: none !important; animation: none !important; }`}
      </style>
      <DirectToField vm={vm} />
      <FieldsList vm={vm} />
      {vm.guidance ? <GuidanceList vm={vm} /> : <EmergencyChecklist vm={vm} />}
      <ActionsList vm={vm} />
    </PanelOrSheet>
  );
}
