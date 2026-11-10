import SheetDialog from "../../components/SheetDialog";
import ActionsList from "./ActionsList";
import DirectToField from "./DirectToField";
import EmergencyChecklist from "./EmergencyChecklist";
import FieldsList from "./FieldsList";
import GuidanceList from "./GuidanceList";
import { useEmergency } from "./useEmergency";

/** The title the sheet opens on (APG modal dialog: a static title takes
 *  the first focus where the content is long), so a screen reader starts
 *  at "Emergency" and the next Tab is Direct To. */
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
 * checklists -- the stock sheet (SheetDialog) over the map, which stays
 * in sight above it on a phone.
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
    <SheetDialog
      open={!!vm.open}
      onOpenChange={(open) => {
        if (!open) vm.close();
      }}
      title={
        <span className="text-destructive outline-none" tabIndex={-1} data-emergency-title="">
          Emergency
        </span>
      }
      initialFocus={(sheet) => sheet.querySelector<HTMLElement>(TITLE)}
      testId="emergency-sheet"
    >
      <style href="wingtip-emergency-at-once" precedence="default">
        {`[data-testid="emergency-sheet"] { transition: none !important; animation: none !important; }`}
      </style>
      <DirectToField vm={vm} />
      <FieldsList vm={vm} />
      {vm.guidance ? <GuidanceList vm={vm} /> : <EmergencyChecklist vm={vm} />}
      <ActionsList vm={vm} />
    </SheetDialog>
  );
}
