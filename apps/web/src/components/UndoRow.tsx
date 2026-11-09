import { useEffect } from "react";
import { Undo2 } from "lucide-react";
import { ListRow } from "./GroupedList";

/** How long the Undo stays in its list after the thing is gone. */
const UNDO_MS = 8_000;

/**
 * Undo, in the list where the thing was removed, not in a toast (the
 * app's rule: a result shows where it happened, lib/problems): a row that
 * says what went and gives it back, gone by itself after a few seconds or
 * at the next removal. The same verb on every platform (docs/navigation.md).
 */
export function UndoRow({ said, onUndo, onDone, testId }: { said: string; onUndo: () => void; onDone: () => void; testId?: string }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [said, onDone]);
  return (
    <ListRow
      media={<Undo2 className="size-5" />}
      title={said}
      value={<span className="text-tint">Undo</span>}
      aria-label={`${said}: Undo`}
      onClick={() => {
        onUndo();
        onDone();
      }}
      data-testid={testId}
    />
  );
}
