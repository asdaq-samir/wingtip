import { useEffect, useEffectEvent, type ReactNode } from "react";
import CloseButton from "./CloseButton";
import { CardHeadRow } from "./CardHead";
import { holdOpenCard } from "../lib/openCards";

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
  // Every card's one head row (CardHeadRow), pinned at the sheet's top,
  // the list scrolling under it (the owner, 2026-11-10), its name at a
  // card's 22 points as Settings' pages' are, where it drew its own at 17.
  return (
    <CardHeadRow
      name={title}
      level="h3"
      testId={testId}
      end={<CloseButton label={backLabel} onClick={onBack} data-testid={testId && `${testId}-close`} />}
    >
      {action}
    </CardHeadRow>
  );
}
