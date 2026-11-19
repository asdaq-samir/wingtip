import { ListRow } from "../../components/GroupedList";
import { useArrangedNotams } from "./useArrangedNotams";

/** The Brief's NOTAMs row (option A, the owner 2026-11-19): how many
 *  matter, opening them on Preflight (`onOpen`). */
export default function NotamsRow({ onOpen }: { onOpen: () => void }) {
  const { count } = useArrangedNotams();
  return <ListRow title="NOTAMs" value={count} chevron onClick={onOpen} data-testid="brief-notams-row" />;
}
