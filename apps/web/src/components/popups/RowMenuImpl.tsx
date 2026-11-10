import { useRef } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";
import RoundButton from "../RoundButton";
import { ROW_LIFT, type RowMenuProps } from "../RowMenu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

/** RowMenu's menus, from the popups' chunk (popupsChunk). */
export function RowMenuImpl({
  label,
  actions,
  testId,
  children,
  defaultOpen = false,
}: RowMenuProps & {
  /** Its ••• menu open as it is first drawn: tapped before the chunk was in. */
  defaultOpen?: boolean;
}) {
  // An action that asks (Delete) opens its question once the menu has
  // closed, the focus left to the question: opened as the item was
  // picked, the closing menu's own focus and dismiss handling crossed the
  // question's opening, which a desktop's Dialog took as a click away and
  // a phone's sheet never showed (flights.spec, CI on both, 2026-10-28).
  const pending = useRef<(() => void) | null>(null);
  // Base UI's finalFocus: the focus back to the ••• (true), or left to the
  // question an action opens (false).
  const afterClose = () => {
    const run = pending.current;
    if (!run) return true;
    pending.current = null;
    // After the menu's own clean-up, not in it: opened from inside it, the
    // question came up under the menu's aria-hidden over the rest of the
    // page, there but out of reach to VoiceOver and to a search by role.
    setTimeout(run, 0);
    return false;
  };
  // A press in a menu is the menu's own: portalled out of the sheet in the
  // page but inside it in React's tree, it went on up to the map sheet's
  // head, whose drag (useDetentDrag) took the finger, and a tap on Delete
  // on a phone left the menu open with Delete only focused (flights.spec,
  // half the runs on the phone project). As PhoneSheetContent stops its own.
  const ownPress = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const items = (Item: typeof DropdownMenuItem | typeof ContextMenuItem) =>
    actions.map((a) => (
      <Item
        key={a.label}
        onClick={() => {
          if (a.asks) pending.current = a.onSelect;
          else a.onSelect();
        }}
        variant={a.destructive ? "destructive" : "default"}
        data-testid={a.testId}
      >
        {a.icon} {a.label}
      </Item>
    ));
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          ROW_LIFT,
          "data-popup-open:relative data-popup-open:z-10 data-popup-open:scale-[1.02] data-popup-open:rounded-2xl data-popup-open:bg-card data-popup-open:shadow-xl",
        )}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {/* Not modal: as a modal menu over the sheet, a pick on a phone
              was now and then left unanswered, the menu open with its item
              focused (flights.spec, one run in four), and Delete's question
              came up under its aria-hidden. Escape and a tap away still
              close it. */}
        <DropdownMenu modal={false} defaultOpen={defaultOpen}>
          <DropdownMenuTrigger render={<RoundButton label={label} data-testid={testId} />}>
            <Ellipsis className="size-5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48" finalFocus={afterClose} onPointerDown={ownPress}>
            {items(DropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48" finalFocus={afterClose} onPointerDown={ownPress}>
        {items(ContextMenuItem)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
