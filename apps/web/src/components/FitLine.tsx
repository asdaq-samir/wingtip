import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";

/** How small a line's type may go to fit before it is cut with "…" instead. */
const LEAST = 0.75;

/**
 * Words kept on one line, their type set smaller to fit its width (to
 * three quarters at the least) and cut with "…" past that: as iOS's
 * label shrinks to fit (adjustsFontSizeToFitWidth). CSS has no fit-to-
 * width of its own (the stock audit, 2026-11-11, W-NR5), so the line is
 * measured once as it is laid out and again only when its width changes
 * (a ResizeObserver), never per frame. The owner, 2026-11-11: "fit the
 * airport name to its line".
 */
export default function FitLine({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = line.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      const room = el.clientWidth;
      const wants = el.scrollWidth;
      if (wants <= room + 0.5 || room === 0) return;
      const scale = Math.max(LEAST, room / wants);
      el.style.fontSize = `${scale}em`;
    };
    fit();
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [children]);
  return (
    <span ref={line} className={cn("block truncate", className)} data-testid={testId}>
      {children}
    </span>
  );
}
