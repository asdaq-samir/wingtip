import { keptStore } from "./storage";

/**
 * Each airplane's checklists, kept in this browser (the owner's option A
 * on #220, 2026-11-08: free, on the device, no account): two texts per
 * airplane, its normal procedures and its emergency ones, each in the
 * checklist's plain text (lib/checklist, read by the shared engine). An
 * airplane is its aircraftKey (lib/aircraftChoice): a pilot's own by id,
 * a tail by its N-number, a stock profile by its name. Both lists start
 * empty: the app ships no flight manual's words, which are the maker's
 * to write and the airplane's to be right for.
 */

export type ChecklistKind = "normal" | "emergency";

type Kept = Record<string, Partial<Record<ChecklistKind, string>>>;

export const useChecklists = keptStore<Kept>("wingtip.checklists", {});

/** The text kept for `airplane`'s `kind` list; "" where none is. */
export function checklistText(kept: Kept, airplane: string, kind: ChecklistKind): string {
  return kept[airplane]?.[kind] ?? "";
}

/** `kept` with `airplane`'s `kind` list set to `text`; a blank text
 *  forgets the list, and an airplane with neither list is let go. */
export function withChecklist(kept: Kept, airplane: string, kind: ChecklistKind, text: string): Kept {
  const lists = { ...kept[airplane] };
  if (text.trim()) lists[kind] = text;
  else delete lists[kind];
  const next = { ...kept };
  if (Object.keys(lists).length) next[airplane] = lists;
  else delete next[airplane];
  return next;
}

export function saveChecklist(airplane: string, kind: ChecklistKind, text: string): void {
  useChecklists.setState(s => ({ value: withChecklist(s.value, airplane, kind, text) }));
}

/**
 * The headings a list can start from, and nothing under them: the phases
 * in the order a pilot's operating handbook sets its procedures, under
 * GAMA Specification No. 1's standard sections (Section 4, Normal
 * Procedures; Section 3, Emergency Procedures), whose checklists the FAA's
 * Airplane Flying Handbook (FAA-H-8083-3C, chapter 2) asks a pilot to use.
 * The items are the pilot's to copy from their airplane's own handbook: a
 * heading with none under it is dropped when the text is read, so what is
 * not written is not run. The iPhone (Checklists.swift) and Android
 * (checklist/Checklists.kt) start from the same headings.
 */
export const CHECKLIST_PHASES: Record<ChecklistKind, string[]> = {
  normal: [
    "Preflight inspection", "Before starting engine", "Starting engine", "Before takeoff", "Takeoff", "Climb",
    "Cruise", "Descent", "Before landing", "Landing", "After landing", "Shutdown", "Securing the airplane",
  ],
  emergency: [
    "Engine failure on the takeoff roll", "Engine failure right after takeoff", "Engine failure in flight",
    "Emergency landing without engine power", "Precautionary landing with engine power", "Ditching",
    "Engine fire during start", "Engine fire in flight", "Electrical fire in flight", "Cabin fire",
    "Electrical power failure", "Inadvertent icing",
  ],
};

/** The headings as the text to write under, a blank line after each. */
export function phasesText(kind: ChecklistKind): string {
  return CHECKLIST_PHASES[kind].map(title => `# ${title}\n\n`).join("");
}
