"use client";

import type { Ref } from "react";
import {
  Button as AriaButton,
  Input as AriaInput,
  SearchField as AriaSearchField,
  type ButtonProps,
  type InputProps,
  type SearchFieldProps,
} from "react-aria-components";
import { cn } from "cn";
import { FIELD_CLEAR, FieldClearGlyph } from "./field-clear";

/*
 * React Aria Components' SearchField, as its Tailwind starter composes it
 * (a SearchField round an Input and its clear Button): the field's
 * Enter, its Escape (clears what is typed, then lets the key go on once
 * it is empty), and its clear, which empties the field and keeps the
 * focus and the keyboard there (`preventFocusOnPress`, focusing the input
 * on the press's start), out of the tab order as iOS's is. shadcn has no
 * search field of its own on any base. The look is iOS's search field's
 * clear: a grey disc with a cross inside the field at its end, while
 * something is typed.
 */

function SearchField({ className, ...props }: Omit<SearchFieldProps, "className"> & { className?: string }) {
  return <AriaSearchField data-slot="search-field" className={cn("group/search-field", className)} {...props} />;
}

/** The field's input; the browser's own clear put away for the field's. */
function SearchFieldInput({ className, ...props }: Omit<InputProps, "className"> & { className?: string; ref?: Ref<HTMLInputElement> }) {
  return (
    <AriaInput
      data-slot="input-group-control"
      className={cn("min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden", className)}
      {...props}
    />
  );
}

/** The clear: inside a SearchField its own (hidden while the field is
 *  empty, its press the field's); elsewhere a field's clear given its
 *  `onPress`, the focus kept in the field all the same. */
function SearchFieldClear({ className, ...props }: Omit<ButtonProps, "className" | "children"> & { className?: string }) {
  return (
    <AriaButton
      data-slot="clear-button"
      preventFocusOnPress
      className={cn(FIELD_CLEAR, "group-data-empty/search-field:hidden", className)}
      {...props}
    >
      <FieldClearGlyph />
    </AriaButton>
  );
}

export { SearchField, SearchFieldInput, SearchFieldClear };
