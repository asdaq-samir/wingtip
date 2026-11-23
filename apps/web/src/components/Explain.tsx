import { useState, type CSSProperties, type ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import type { ExplainedTerm } from "../lib/explain";
import { loadPopups, usePopups } from "./popupsChunk";

/**
 * An abbreviation or a figure's name that says what it means when tapped
 * (the FPL redesign, the owner 2026-11-17): the word itself is the stock
 * Popover's button, in the tint as everything tappable is, and the
 * popover its whole name, one plain sentence and where it comes from
 * (lib/explain). No label is added beside it, so the screen reads as it
 * did. A tap on it is its own, never the row's under it.
 *
 * The popover and its words are on the popups' chunk (ExplainPopover,
 * popupsChunk), out of the first load the route's figures are drawn in:
 * until it is in, the word is a plain button, and a tap on it opens the
 * popover once it is.
 */
export default function Explain({
  term,
  children,
  spoken,
  className,
}: {
  term: ExplainedTerm;
  children?: ReactNode;
  /** Its whole name for a screen reader where the word stands alone (a
   *  column's heading, "Magnetic heading"). */
  spoken?: string;
  className?: string;
}) {
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  const word = children ?? term;
  const trigger = {
    className: cn(
      // A 44-point area up and down by a pseudo-element, the word's own
      // size unchanged (decision 0030).
      "relative inline cursor-help rounded-sm text-tint outline-none hit-x-1 hit-y-3 focus-visible:ring-2 focus-visible:ring-ring",
      className,
    ),
    // 44 across too where the word is narrower ("MH" is 21 to 25 points,
    // and 4 either side made 29 to 33: the HIG audit of 2026-11-23, L3), a
    // wider word's 4 kept; and 44 tall whatever its line.
    style: { "--hit-x": "min(-4px, calc((100% - 44px) / 2))", "--hit-y": "calc((100% - 44px) / 2)" } as CSSProperties,
    "aria-label": `${spoken ?? children ?? term}: what it means`,
    onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    "data-testid": `explain-${term.replace(/\s+/g, "-").toLowerCase()}`,
  };
  if (popups)
    return (
      <popups.ExplainPopover term={term} defaultOpen={asked} trigger={{ ...trigger, onClick: (event) => event.stopPropagation() }}>
        {word}
      </popups.ExplainPopover>
    );
  return (
    <BaseButton
      {...trigger}
      onClick={(event) => {
        event.stopPropagation();
        setAsked(true);
        void loadPopups();
      }}
    >
      {word}
    </BaseButton>
  );
}
