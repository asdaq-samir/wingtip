import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";

/**
 * A head row as iOS's inline navigation bar and Apple Maps' place card at
 * its smallest size lay one out (the owner, 2026-11-11: "let's move the
 * title in the middle", from Maps' screenshot): the buttons at the start
 * (a card's Share, its star) and at the end (the close), and the middle --
 * the name and the line under it -- centred across the whole row, clear of
 * both by the same inset each side, the wider side's, so it is centred on
 * the card whatever each side holds. Each side as wide as its buttons
 * (measured, ResizeObserver: CSS has no "the wider of two boxes"), its
 * column that wide on both sides; until measured, each its own.
 */
export function HeadGrid({
  start,
  middle,
  end,
  middleRef,
  middleClassName,
}: {
  start?: ReactNode;
  middle: ReactNode;
  end?: ReactNode;
  middleRef?: (node: HTMLDivElement | null) => void;
  middleClassName?: string;
}) {
  const startBox = useRef<HTMLDivElement>(null);
  const endBox = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<number | null>(null);
  useLayoutEffect(() => {
    const boxes = [startBox.current, endBox.current].filter((box): box is HTMLDivElement => !!box);
    const measure = () => setSide(Math.max(0, ...boxes.map((box) => box.offsetWidth)));
    measure();
    // None under jsdom: the tests' page is laid out by nothing.
    if (typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(measure);
    for (const box of boxes) seen.observe(box);
    return () => seen.disconnect();
  }, []);
  return (
    <div
      className="grid w-full min-w-0 grid-cols-[var(--head-side,auto)_minmax(0,1fr)_var(--head-side,auto)] items-center gap-2"
      style={side === null ? undefined : ({ "--head-side": `${side}px` } as CSSProperties)}
    >
      <div ref={startBox} className="flex w-max items-center gap-2.5 justify-self-start" data-slot="head-start">
        {start}
      </div>
      <div ref={middleRef} className={cn("flex min-w-0 flex-col items-center text-center", middleClassName)}>
        {middle}
      </div>
      <div ref={endBox} className="-mr-1 flex w-max items-center gap-2.5 justify-self-end" data-slot="head-end">
        {end}
      </div>
    </div>
  );
}
