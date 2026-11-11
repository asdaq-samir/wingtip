"use client";

import * as React from "react";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn } from "cn";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";

/**
 * shadcn's Command, on Base UI's Autocomplete where it was on cmdk: a field
 * that keeps the arrows and Enter on a list of items, each a thing to do
 * (its `onClick`, which Enter on the highlighted one runs too). The list
 * is inline (`inline open`), drawn where the caller puts it -- in the page,
 * a dialog or a popover of the caller's own -- and never filtered here:
 * every list in the app is filtered by its caller (the airport lookup on
 * the server, the palette by its own words), as cmdk's `shouldFilter`
 * was off everywhere. The field's words are the caller's (`value`,
 * `onValueChange`); an item taken does not write itself into the field,
 * as an autocomplete's would, since a pick here is an action.
 */
type CommandRootProps = Omit<
  AutocompletePrimitive.Root.Props<unknown>,
  "inline" | "open" | "filter" | "items" | "mode" | "onValueChange"
> & { onValueChange?: (value: string) => void };

/** The list's keyboard and state alone, no box of its own: round a field
 *  and a popover of the caller's (a route's box, a card's ident). */
function CommandRoot({ onValueChange, ...props }: CommandRootProps) {
  return (
    <AutocompletePrimitive.Root
      inline
      open
      filter={null}
      onValueChange={(next, details) => {
        if (details.reason === "item-press") return;
        onValueChange?.(next);
      }}
      {...props}
    />
  );
}

function Command({
  className,
  style,
  children,
  ...props
}: CommandRootProps & { className?: string; style?: React.CSSProperties; "data-testid"?: string }) {
  const { "data-testid": testId, ...root } = props;
  return (
    <CommandRoot {...root}>
      <div
        data-slot="command"
        data-testid={testId}
        className={cn("flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground", className)}
        style={style}
      >
        {children}
      </div>
    </CommandRoot>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogContent className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** The field, in shadcn's input group with its glass. */
function CommandInput({ className, ...props }: AutocompletePrimitive.Input.Props) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <AutocompletePrimitive.Input
          data-slot="command-input"
          className={cn(
            "w-full text-sm pointer-coarse:text-(length:--type-row) outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

/** A plain field of the caller's own as the list's field (a route's box,
 *  a card's ident): Base UI's Input with its own props and element. */
const CommandField = AutocompletePrimitive.Input;

/** The field's clear: Base UI's own, shown while something is typed,
 *  clearing it through the root's `onValueChange` and keeping the focus
 *  in the field (drawn as the app's ClearButton by its `render`). */
const CommandClear = AutocompletePrimitive.Clear;

function CommandList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="command-list"
      className={cn("no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none", className)}
      {...props}
    />
  );
}

/** What the list says where it has nothing: Base UI's Autocomplete.Status,
 *  which screen readers hear politely as its words change. It stays
 *  mounted, as Base UI asks (VoiceOver on iOS reads none of a status that
 *  arrives whole, lib/announce), and the caller fills it only where its
 *  own count is none; empty, it takes no room. Not Autocomplete.Empty,
 *  which needs the root's `items`, and the lists here are filtered by
 *  their callers. */
function CommandEmpty({ className, ...props }: AutocompletePrimitive.Status.Props) {
  return (
    <AutocompletePrimitive.Status
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm pointer-coarse:text-(length:--type-detail) empty:py-0", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  headingClassName,
  children,
  ...props
}: AutocompletePrimitive.Group.Props & { heading?: React.ReactNode; headingClassName?: string }) {
  return (
    <AutocompletePrimitive.Group data-slot="command-group" className={cn("overflow-hidden p-1 text-foreground", className)} {...props}>
      {heading !== undefined && (
        <AutocompletePrimitive.GroupLabel
          data-slot="command-group-heading"
          className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", headingClassName)}
        >
          {heading}
        </AutocompletePrimitive.GroupLabel>
      )}
      {children}
    </AutocompletePrimitive.Group>
  );
}

function CommandSeparator({ className, ...props }: AutocompletePrimitive.Separator.Props) {
  return (
    <AutocompletePrimitive.Separator data-slot="command-separator" className={cn("-mx-1 h-px w-auto bg-border", className)} {...props} />
  );
}

function CommandItem({ className, children, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm pointer-coarse:text-(length:--type-row) outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-highlighted:**:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs pointer-coarse:text-(length:--type-note) tracking-widest text-muted-foreground group-data-highlighted/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandClear,
  CommandDialog,
  CommandEmpty,
  CommandField,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandRoot,
  CommandSeparator,
  CommandShortcut,
};
