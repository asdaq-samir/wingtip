import type { ComponentProps } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { X } from "lucide-react";
import { cn } from "cn";

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

/** The clear on its own, for what is folded to a row while its field is
 *  shut (FPL's half route): Base UI's Button in the clear's look. React
 *  Aria's (ui/search-field's SearchFieldClear) is for inside its
 *  SearchField, and drew all of React Aria into the first load from here
 *  (169 KB unminified, 2026-11-18). */
export function FieldClearButton({ className, ...props }: Omit<ComponentProps<typeof BaseButton>, "children">) {
  return (
    <BaseButton data-slot="clear-button" className={cn(FIELD_CLEAR, className)} {...props}>
      <FieldClearGlyph />
    </BaseButton>
  );
}
