import type { Key, Selection } from "react-aria-components";
import { ListBox, ListBoxItem } from "react-aria-components";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { ListGroup } from "./GroupedList";
import { ItemActions, ItemContent, ItemMedia, ItemTitle } from "./ui/item";
import { TEXT } from "../lib/text";

/** One choice of a `ListPicks`: its words, a chevron where it opens a page
 *  of its own, and what a tap on it does. */
export interface ListPick {
  id: string;
  title: string;
  chevron?: boolean;
  testId?: string;
  act: () => void;
}

// A row as GroupedList's ListRow draws one of a radio group's: 44 at the
// least, the group's own padding, iOS's checkmark in the tint on the one
// picked (React Aria's data-selected).
const ROW = `group/item group flex w-full min-h-11 flex-wrap items-center gap-2.5 rounded-none border-0 px-3 py-2 in-data-[slot=item-group]:py-3.25 text-left ${TEXT.detail} outline-none transition-colors duration-100 hover:bg-muted/50 data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-background pointer-coarse:active:bg-muted`;
const TITLE = cn("line-clamp-none font-normal", TEXT.row);

/**
 * A list's one choice where a pick does something at once (plans the route
 * again, opens a page): React Aria's ListBox, single selection, in the
 * grouped list's box. The arrow keys move between the choices and pick
 * none -- its "toggle" selection does not follow the focus, where a radio
 * group picks each one an arrow reaches (the WAI-ARIA radio pattern) -- and
 * a tap, Space or Enter picks. The one picked is the listbox's selected
 * option, as a reader hears it.
 *
 * With none picked yet, React Aria calls a tap onAction; with one picked,
 * a selection change, to none where the one picked is tapped again: each
 * is that row's pick.
 */
export function ListPicks({
  label,
  title,
  selected,
  picks,
}: {
  label: string;
  title?: string;
  selected: string | null;
  picks: ListPick[];
}) {
  const act = (key: Key | undefined) => picks.find((p) => p.id === key)?.act();
  return (
    <ListGroup title={title}>
      <ListBox
        aria-label={label}
        selectionMode="single"
        selectedKeys={selected !== null ? [selected] : []}
        onSelectionChange={(keys: Selection) => act(keys === "all" ? undefined : (keys.values().next().value ?? selected ?? undefined))}
        onAction={act}
        className="flex flex-col divide-y divide-border outline-none"
      >
        {picks.map((p) => (
          <ListBoxItem key={p.id} id={p.id} textValue={p.title} data-testid={p.testId} className={ROW}>
            <ItemMedia>
              <Check className="invisible size-4 text-tint group-data-selected:visible" aria-hidden />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className={TITLE}>{p.title}</ItemTitle>
            </ItemContent>
            {p.chevron && (
              <ItemActions className="ml-auto">
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </ItemActions>
            )}
          </ListBoxItem>
        ))}
      </ListBox>
    </ListGroup>
  );
}
