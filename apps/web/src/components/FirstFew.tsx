import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { PillSection } from "./Favorites";
import { ListGroup } from "./GroupedList";
import { TEXT } from "../lib/text";

/** How many rows a section shows before its title opens the rest. */
const FIRST_ROWS = 3;

/**
 * A titled section of a card that shows its first three rows, its title
 * the way to the rest and "3 of 27" at its right, as the airport card's
 * Frequencies were first, and then every section of lists on it, at the
 * owner's ask (2026-10-29: "I like the frequencies only show 3 and then
 * rest can be seen by clicking on it. Can we do similar to other
 * sections?"). Opened, its title closes it again, its chevron turned
 * down while it is open (the owner, 2026-11-11: "how do you go back to
 * shorter list once it's expanded?").
 */
export function FirstFew({
  title,
  rows,
  after,
  open = false,
  testId,
}: {
  title: string;
  rows: ReactNode[];
  /** Rows always shown after them: a field's radio remarks under its
   *  frequencies. */
  after?: ReactNode;
  /** All of them from the start: the approaches, where the route's
   *  Approaches opened the card. */
  open?: boolean;
  testId?: string;
}) {
  const [all, setAll] = useState(open);
  const long = rows.length > FIRST_ROWS;
  const more = !all && long;
  return (
    <PillSection
      title={title}
      testId={testId}
      onMore={long ? () => setAll(!all) : undefined}
      expanded={long ? all : undefined}
      right={more ? <span className={cn("text-muted-foreground", TEXT.note)}>{`${FIRST_ROWS} of ${rows.length}`}</span> : undefined}
    >
      <ListGroup>
        {more ? rows.slice(0, FIRST_ROWS) : rows}
        {after}
      </ListGroup>
    </PillSection>
  );
}
