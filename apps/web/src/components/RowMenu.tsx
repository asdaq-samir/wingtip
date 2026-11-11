import { useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import RoundButton from "./RoundButton";
import { loadPopups, usePopups } from "./popupsChunk";

/** One of a row's actions: Share, Clear, Delete… */
interface RowAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Red, for what cannot be walked back. */
  destructive?: boolean;
  /** It opens a question of its own (Delete's), which keeps the focus. */
  asks?: boolean;
  /** Its name to a screen reader, where that is more than the word:
   *  "Remove KDLH from Recents". */
  spoken?: string;
  testId?: string;
}

export interface RowMenuProps {
  /** The •••'s name to a screen reader, "More for C81 to KDLH": not the row's own name first, which a search for the row by its name also found. */
  label: string;
  actions: RowAction[];
  testId?: string;
  children: ReactNode;
}

/** The row's own box, lifted while its held menu is open (RowMenuImpl).
 *  No iOS callout over a long press: the menu is the row's own. */
export const ROW_LIFT =
  "group/row flex items-center gap-1 pr-2 transition-[background-color,box-shadow,transform] [-webkit-touch-callout:none]";

/** The •••: with a mouse, shown as the row is pointed at or has the focus
 *  in it, as Base UI's own context-menu example has it; to a finger always
 *  there, its long press the same menu. */
export const ROW_MORE =
  "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:data-popup-open:opacity-100";

/**
 * A list's row as Maps' Recents set one (the owner's screenshot,
 * 2026-10-28): the row itself (`children`, a ListRow or PageRow), at its
 * end •••, the stock DropdownMenu, with the row's actions, and the same
 * actions from a long press or a right click anywhere on it, the stock
 * ContextMenu, the row lifted white over the list while that menu is
 * open, as Maps lifts it.
 */
export default function RowMenu(props: RowMenuProps) {
  // The menus are on the popups' chunk (popupsChunk): until it is in, the
  // row and its •••, a tap on which opens the menu once it is.
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  if (popups) return <popups.RowMenuImpl {...props} defaultOpen={asked} />;
  return (
    <div className={ROW_LIFT}>
      <div className="min-w-0 flex-1">{props.children}</div>
      <RoundButton
        label={props.label}
        className={ROW_MORE}
        data-testid={props.testId}
        onClick={() => {
          setAsked(true);
          void loadPopups();
        }}
      >
        <Ellipsis className="size-5" aria-hidden="true" />
      </RoundButton>
    </div>
  );
}
