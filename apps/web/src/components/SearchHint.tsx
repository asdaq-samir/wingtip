import { Search } from "lucide-react";
import { ListGroup, ListRow } from "./GroupedList";
import { Kbd } from "./ui/kbd";
import { askSearch, searchKeys } from "../lib/oneSearch";

/** The Map menu's way to the one search, its keys beside it: airports,
 *  airplanes, screens and actions, wherever the pilot is (lib/oneSearch). */
export default function SearchHint() {
  return (
    <ListGroup title="Search">
      <ListRow
        media={<Search className="size-5" />}
        title="Search"
        value={<Kbd>{searchKeys()}</Kbd>}
        onClick={() => askSearch()}
        data-testid="search-hint"
      />
    </ListGroup>
  );
}
