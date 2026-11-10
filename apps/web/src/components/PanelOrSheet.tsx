import type { ReactNode } from "react";
import SheetDialog from "./SheetDialog";
import { SheetCard } from "./SheetCard";
import { useIsMobile } from "../hooks/use-mobile";

/**
 * A screen that must leave the map usable while it is up -- the emergency
 * assistant, the welcome (docs/design/web.md §8 and §14) -- in the side
 * panel from `md` up, as a card there (SheetCard: a labelled region, not
 * a modal, the map live beside it and nothing put out of reach), and on a
 * phone the stock sheet it was (SheetDialog). Its close, Escape or the
 * card's own way out call `onClose`, and the focus goes to its title as
 * it opens on both (the APG dialog's static title for long content).
 */
export default function PanelOrSheet({
  open,
  onClose,
  title,
  name,
  description,
  raise = "half",
  testId,
  titleFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The sheet's title on a phone, as drawn (an ink, a focus mark). */
  title: ReactNode;
  /** Its name as words: the side panel's card head and the tab bar's. */
  name: string;
  description?: string;
  /** How far the side panel comes up for it: all the way for one to read
   *  at once (the emergency). */
  raise?: "half" | "full";
  testId: string;
  /** The phone sheet's title to focus as it opens; the card's head takes
   *  the focus by itself. */
  titleFocus?: string;
  children: ReactNode;
}) {
  const onPhone = useIsMobile();
  if (!onPhone)
    return open ? (
      <SheetCard title={name} description={description} raise={raise} testId={testId} onClose={onClose}>
        <div className="grid gap-4">{children}</div>
      </SheetCard>
    ) : null;
  return (
    <SheetDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      initialFocus={titleFocus ? (sheet) => sheet.querySelector<HTMLElement>(titleFocus) : undefined}
      testId={testId}
    >
      {children}
    </SheetDialog>
  );
}
