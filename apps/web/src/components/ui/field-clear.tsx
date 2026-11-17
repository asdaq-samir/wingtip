import { X } from "lucide-react";

// Apart from ui/search-field, so a field that is not React Aria's (Base
// UI's Autocomplete, ui/command's CommandClear) draws the same clear
// without React Aria's search field on the first load.

/** iOS's clear in a text field: a 20-point grey disc with the cross cut
 *  in the field's own ground, its 44-point hit area its pseudo-element's
 *  (CLAUDE.md: controls never grow to it). Also Base UI's Autocomplete
 *  clear's look (ui/command's CommandClear), so every field's is one. */
export const FIELD_CLEAR =
  "relative grid size-5 shrink-0 place-items-center rounded-full bg-muted-foreground/50 text-background outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-3 after:content-['']";

/** The cross in it, drawn heavy as SF Symbols' xmark.circle.fill. */
export function FieldClearGlyph() {
  return <X className="size-3" strokeWidth={3} aria-hidden="true" />;
}
