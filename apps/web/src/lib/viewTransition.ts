import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./motion";

type WithTransitions = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * A page or card giving way to the next as the platform's own pages do:
 * the browser's View Transition (index.css times it by motion.page on the
 * sheet's ease-out, a short shared-axis slide of the element named
 * `wingtip-page`), where the browser has one. React's change is made
 * inside it, at once (flushSync), so the new page is the one captured.
 * With Reduce Motion, or no View Transitions, the change is just made.
 */
export function withPageTransition(change: () => void): void {
  const doc = typeof document !== "undefined" ? (document as WithTransitions) : null;
  if (!doc || typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
    change();
    return;
  }
  doc.startViewTransition(() => flushSync(change));
}
