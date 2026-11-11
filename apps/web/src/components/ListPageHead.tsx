import { useEffect, useEffectEvent, type ReactNode } from "react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedHead } from "./PinnedHead";
import { holdOpenCard } from "../lib/openCards";
import { TEXT } from "../lib/text";

/** A list in full's head, every list's: its name, what acts on the whole
 *  list (Edit, Clear), and at its right the close, which goes back to the
 *  section it came from -- no Back on the left, at the owner's ask
 *  ("remove the back buttons, because close button should behave as the
 *  back button", 2026-10-22). It is a device's Back too (lib/openCards,
 *  lib/backNavigation), as a card's close is: Android's Back put the sheet down and
 *  left the list open. */
export function ListPageHead({
  title,
  backLabel,
  onBack,
  action,
  testId,
}: {
  title: string;
  /** The close's name to a screen reader: where it goes back to. */
  backLabel: string;
  onBack: () => void;
  action?: ReactNode;
  testId?: string;
}) {
  const back = useEffectEvent(onBack);
  useEffect(() => holdOpenCard({ close: () => back(), inBar: false }), []);
  // Its name and close one row pinned at the sheet's top, the list
  // scrolling under it (PinnedHead; the owner, 2026-11-10).
  return (
    <PinnedHead testId={testId}>
      <h3 className={cn("min-w-0 flex-1 truncate font-bold", TEXT.title)}>{title}</h3>
      {action}
      <CloseButton label={backLabel} onClick={onBack} className="-mr-1" data-testid={testId && `${testId}-close`} />
    </PinnedHead>
  );
}
