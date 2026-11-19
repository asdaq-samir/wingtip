import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { SmallMark, SmallTile } from "./Favorites";

/** The one Add at the end of a row of Favorites, as Apple Maps' has: the
 *  stock menu offers what to add (`choices`), each choice the add its own
 *  tile used to start. A menu of actions, the stock DropdownMenu's items,
 *  not a pick-one: 2ee692701 made every pick-one Base UI's Select (the
 *  owner, 2026-11-17) and took this in with them, a combobox that kept no
 *  value and, closing, gave the focus back to itself, from the one search
 *  the choice had just asked (favorites-add.spec, the night of
 *  2026-11-19). Closed by a choice, the focus stays where the choice put
 *  it (finalFocus); by Escape, it comes back to the tile. */
export default function AddFavoriteTile({
  choices,
  testId,
}: {
  choices: { value: string; label: string; testId: string; onPick: () => void }[];
  testId: string;
}) {
  // Whether the menu closed on a choice, which has put the focus where it
  // wants it; closed without one, the focus comes back to the tile.
  const chose = useRef(false);
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) chose.current = false;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger
        render={
          <SmallTile
            mark={<SmallMark icon={<Plus />} className="bg-foreground/8 text-tint" />}
            title="Add"
            label="Add a Favorite"
            onClick={() => {}}
            testId={testId}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-auto min-w-40" finalFocus={() => !chose.current}>
        {choices.map((c) => (
          <DropdownMenuItem
            key={c.value}
            data-testid={c.testId}
            onClick={(event) => {
              // The menu's own click handler, after this one, gives the
              // focus back to the item (Safari's, in Base UI's list
              // navigation), from the one search the choice focuses within
              // the tap so the keyboard comes up: the field had it for a
              // millisecond and the page for good once the menu went
              // (a focus trace, favorites-add.spec's Airplane, the night of
              // 2026-11-19). So the choice closes the menu itself.
              event.preventBaseUIHandler();
              chose.current = true;
              setOpen(false);
              c.onPick();
            }}
          >
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
