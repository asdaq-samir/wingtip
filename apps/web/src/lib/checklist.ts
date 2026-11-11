import type { ChecklistRead } from "./engine/contract";
import { callEngine } from "./engine/engine";

/**
 * An airplane's checklist as the pilot writes it, in plain text: a line
 * starting "#" a section, every other line an item, its challenge and its
 * response split by a dash or a run of dots, as a printed checklist sets
 * them ("Fuel selector -- Both", "Mixture ..... Rich"). What the editor
 * shows and what it saves, kept on the device (lib/checklists). An item
 * before any section is in "Checklist".
 *
 * Read and written by the shared engine (engine/crates/pilot/src/pilot/
 * checklist.rs, through lib/engine), the code the iPhone app reads a
 * checklist with too: the rule lives there.
 */

export function checklistOf(text: string): ChecklistRead {
  return callEngine("checklist_read", { text });
}

export function textOf(checklist: ChecklistRead): string {
  return callEngine("checklist_write", { checklist });
}
