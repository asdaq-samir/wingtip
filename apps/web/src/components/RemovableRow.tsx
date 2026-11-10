import { type ReactNode } from "react";
import { Share, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "./ui/button";
import RowMenu from "./RowMenu";
import { RowRemove } from "./rowRemove";
import { TEXT } from "../lib/text";
import { useConfirm } from "./useConfirm";
import { cancelled, shareOrCopy } from "../lib/share";
import { showError } from "../lib/problems";
import { describeError } from "../lib/api/client";

/**
 * A kept list's row with its Share and Remove in the stock row menu
 * (RowMenu): the ••• at its end -- with a mouse, as the row is pointed at
 * or has the focus -- and the same menu from a long press or a right
 * click, Base UI's ContextMenu's own (the owner, 2026-11-10, where a
 * swipe uncovered a Delete in a scroller of our own). In Edit, the row's
 * minus (RemoveMinus) removes it too. What it removes comes back by the
 * toast's Undo where the list has one (lib/toast).
 */
export function RemovableRow({
  name,
  label,
  onDelete,
  share,
  children,
}: {
  /** The row's name, for its •••: "More for KDLH". */
  name: string;
  /** What Remove does, said by a screen reader: "Remove KDLH from Recents". */
  label: string;
  onDelete: () => void;
  /** What the row is, as a link to send: its menu's Share. */
  share?: { title: string; url: string };
  children: ReactNode;
}) {
  const shareIt = () => {
    if (!share) return;
    shareOrCopy(share).catch((err) => {
      if (!cancelled(err)) showError("Not shared", describeError(err));
    });
  };
  // Every list's menu the same two, at the owner's word (2026-10-28): "all
  // the lists should only have two options the words Share and Remove with
  // their icons. That's it".
  return (
    <RowRemove.Provider value={{ remove: onDelete }}>
      <RowMenu
        label={`More for ${name}`}
        testId="row-more"
        actions={[
          ...(share ? [{ label: "Share", icon: <Share />, onSelect: shareIt, testId: "row-share" }] : []),
          { label: "Remove", icon: <Trash2 />, destructive: true, spoken: label, onSelect: onDelete, testId: "row-remove" },
        ]}
      >
        {children}
      </RowMenu>
    </RowRemove.Provider>
  );
}

/**
 * A list's Clear, at its heading's end (ListGroup's `action`), as iOS puts
 * one over its Recents: asked first, as iOS asks before what cannot be
 * walked back, the list being all of it. Its words grow with the text, not
 * its box; a pseudo-element makes the 44-point area round them.
 */
export function ClearList({
  title,
  description,
  onClear,
  testId,
}: {
  /** The question asked: "Clear the Recents?". */
  title: string;
  description: string;
  onClear: () => void;
  testId?: string;
}) {
  const [ask, dialog] = useConfirm({ title, description, confirmLabel: "Clear", destructive: true, onConfirm: onClear });
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={ask}
        data-testid={testId}
        className={cn("relative h-auto px-1 py-0.5 font-normal text-tint after:absolute after:-inset-x-2 after:-inset-y-3", TEXT.row)}
      >
        Clear
      </Button>
      {dialog}
    </>
  );
}
