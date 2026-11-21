import { useState, type ReactNode } from "react";
import SheetDialog from "./SheetDialog";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  /** Red, for what cannot be walked back. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Asking before an action, in the app rather than the browser: the stock
 * centred alert (SheetDialog, Base UI's AlertDialog) at every width, with
 * the action and Cancel under the question, as iOS asks -- over the page,
 * never a card or a sheet from the foot (the owner, 2026-11-20: "the
 * confirmation shouldn't open a new card"; before it a phone had a sheet).
 * `window.confirm` was what asked before -- the browser's own box,
 * unthemed, headed by the site's address, and in an iOS app's web view
 * nothing at all (it returns false unless the native host draws one),
 * so the action it guarded silently never ran.
 *
 * A hook rather than a wrapper around the trigger, because the triggers
 * are IconButtons, whose root is a Tooltip rather than an element a
 * dialog trigger could take over: call `ask` from the button, render
 * `dialog` anywhere beside it.
 */
export function useConfirm({ title, description, confirmLabel, destructive, onConfirm }: ConfirmOptions): [() => void, ReactNode] {
  const [open, setOpen] = useState(false);
  const dialog = (
    <SheetDialog
      open={open}
      onOpenChange={setOpen}
      alert
      centered
      title={title}
      description={description}
      action={{
        label: confirmLabel,
        destructive,
        onClick: () => {
          setOpen(false);
          onConfirm();
        },
      }}
    />
  );
  return [() => setOpen(true), dialog];
}
