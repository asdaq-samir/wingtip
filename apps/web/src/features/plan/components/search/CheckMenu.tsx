import type { ReactElement } from "react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../../../../components/ui/dropdown-menu";

/** A menu of things any number of which may be ticked (a chip's fuels or
 *  surfaces), as a stock Menu's checkbox items whose trigger is `trigger`:
 *  open while ticking, as iOS's multi-select menus stay. */
export default function CheckMenu<T extends string>({
  picked,
  items,
  words,
  onPick,
  trigger,
  testId,
}: {
  picked: readonly T[];
  items: readonly T[];
  words: (item: T) => string;
  onPick: (picked: T[]) => void;
  trigger: ReactElement;
  testId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} data-testid={testId} />
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item}
            checked={picked.includes(item)}
            closeOnClick={false}
            onCheckedChange={(on: boolean) =>
              onPick(on ? items.filter((i) => i === item || picked.includes(i)) : picked.filter((i) => i !== item))
            }
            data-testid={`${testId}-${item.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {words(item)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
