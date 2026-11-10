import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedCardBar } from "./PinnedCardBar";
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
  const named = useRef<HTMLHeadingElement>(null);
  // Its name and close pinned as the list scrolls (the one scrolling rule, PinnedCardBar).
  return (
    <>
      <PinnedCardBar title={title} watched={named} onClose={onBack} closeTestId={`${testId ?? "list-page"}-close`} />
      <div className="flex items-center gap-2" data-testid={testId}>
        <h3 ref={named} className={cn("flex-1 font-bold", TEXT.title)}>
          {title}
        </h3>
        {action}
        <CloseButton label={backLabel} onClick={onBack} className="-mr-1" data-testid={testId && `${testId}-close`} />
      </div>
    </>
  );
}
