import { cn } from "cn";
import { Skeleton } from "./ui/skeleton";

/**
 * A figure that is coming -- the engine's .wasm still loading, a leg
 * still streaming in, a fetch on its way -- drawn as the stock Skeleton's
 * shape the width of a short figure, in the line where the figure will
 * stand, so nothing moves when it lands. A dash means one thing only:
 * the figure needs an airplane (decision 0011; the FPL redesign, the owner
 * 2026-11-17: "a dash only means needs an airplane"). A screen reader hears
 * that it is being worked out.
 */
export default function FigureWait({ className, testId }: { className?: string; testId?: string }) {
  return (
    <span className="inline-flex align-middle" data-testid={testId ?? "figure-wait"}>
      <Skeleton aria-hidden="true" className={cn("inline-block h-[0.9em] w-[4ch]", className)} />
      <span className="sr-only">Working out</span>
    </span>
  );
}
