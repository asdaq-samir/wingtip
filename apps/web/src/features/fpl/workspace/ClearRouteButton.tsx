import { X } from "lucide-react";
import IconButton from "../../../components/IconButton";
import { useConfirm } from "../../../components/useConfirm";

/**
 * FPL's ✕: one tap asks "Clear Route?" in the stock centred alert (never
 * a card), and Clear Route takes the route's points, stops and procedures
 * off; the plan's Undo brings them back (the owner, 2026-11-20: "just tap
 * it once and confirm"; it was a long press). With no route there is
 * nothing to clear, so it stays where it is, dimmed and unpressable, as
 * iOS dims a toolbar button with nothing to do rather than drawing the row
 * again without it. The page's close is the FPL button beside it (PageToggle).
 */
export default function ClearRouteButton({ hasRoute, onClear }: { hasRoute: boolean; onClear: () => void }) {
  const [ask, asked] = useConfirm({
    title: "Clear Route?",
    description: "The route's points, stops and procedures come off the plan. Undo brings them back.",
    confirmLabel: "Clear Route",
    destructive: true,
    onConfirm: onClear,
  });
  return (
    <>
      <IconButton round label="Clear route" disabled={!hasRoute} onClick={ask} data-testid="fpl-clear">
        <X className="size-5" aria-hidden="true" />
      </IconButton>
      {asked}
    </>
  );
}
