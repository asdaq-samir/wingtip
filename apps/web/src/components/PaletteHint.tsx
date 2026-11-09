import { Search } from "lucide-react";
import { ListGroup, ListRow } from "./GroupedList";
import { Kbd } from "./ui/kbd";
import { openPalette, paletteKeys } from "../lib/palette";

/** The Map menu's way to the command palette, its keys beside it: a
 *  search for airports, screens and actions, wherever the pilot is. */
export default function PaletteHint() {
  return (
    <ListGroup title="Search">
      <ListRow
        media={<Search className="size-5" />}
        title="Search and Commands"
        value={<Kbd>{paletteKeys()}</Kbd>}
        onClick={() => openPalette()}
        data-testid="palette-hint"
      />
    </ListGroup>
  );
}
