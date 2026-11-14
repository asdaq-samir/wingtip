import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { cn } from "cn";

/**
 * A text field's clear, inside it at its end while something is typed,
 * as iOS's text fields and search fields have one -- every field the
 * pilot types words into, at their ask: the search bars, the route's
 * box, the airport search and the stock field (ui/input). A grey disc
 * with a cross, its 44-point hit area its pseudo-element's (CLAUDE.md:
 * controls never grow to it). Inside a Base UI Autocomplete it is the
 * look of the stock Autocomplete.Clear (`render={<ClearButton … />}`),
 * which clears the field, keeps the focus there and shows only while
 * something is typed; elsewhere `onClear` does the clearing.
 */
export default function ClearButton({
  onClear,
  label = "Clear",
  className,
  testId = "field-clear",
  // Base UI's own words for the button ("x"): the cross is drawn here.
  children: _children,
  ...props
}: { onClear?: () => void; label?: string; testId?: string } & Omit<ComponentProps<"button">, "aria-label">) {
  return (
    <BaseButton
      aria-label={label}
      data-testid={testId}
      data-slot="clear-button"
      // Not a press that takes the focus from the field: the clear puts
      // it back there, as iOS's does, the keyboard staying up.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClear}
      {...props}
      className={cn(
        "relative grid size-5 shrink-0 place-items-center rounded-full bg-muted-foreground/50 text-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "after:absolute after:-inset-3 after:content-['']",
        className,
      )}
    >
      <X className="size-3" strokeWidth={3} aria-hidden="true" />
    </BaseButton>
  );
}
