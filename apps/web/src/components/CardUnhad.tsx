import { CardHead } from "./CardHead";
import { ListGroup, ListRow } from "./GroupedList";
import { WORDING } from "../lib/wording/generated/wording";

/**
 * A card whose thing could not be had: its head, its name with why in the
 * line under it where its tabs would be, and ✕; then, where asking again
 * may answer (the planner out of reach, not a thing not found), Try again
 * (lib/problems: errors where they happen). The airport card's and the
 * airplane card's, the one state.
 */
export function CardUnhad({
  name,
  line,
  onClose,
  nameTestId,
  lineTestId,
  closeTestId,
  retry,
}: {
  name: string;
  line: string;
  onClose: () => void;
  nameTestId: string;
  lineTestId: string;
  closeTestId: string;
  /** Asking again, and whether it is under way; none where it cannot help. */
  retry?: { fetching: boolean; onRetry: () => void; testId: string } | null;
}) {
  return (
    <>
      <div className="flex flex-col pt-[var(--corner-inset,0.75rem)]" data-to-edge="">
        <CardHead name={name} nameTestId={nameTestId} line={line} lineTestId={lineTestId} onClose={onClose} closeTestId={closeTestId} />
      </div>
      {retry && (
        <div className="pt-4">
          <ListGroup>
            <ListRow
              title={<span className="text-tint">{retry.fetching ? "Trying again…" : WORDING.tryAgain}</span>}
              onClick={retry.fetching ? undefined : retry.onRetry}
              data-testid={retry.testId}
            />
          </ListGroup>
        </div>
      )}
    </>
  );
}
