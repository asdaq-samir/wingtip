import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

/**
 * A panel that folds with its height eased, the rows under it moving with
 * it (none with Reduce Motion, index.css), on the fold's own time and
 * curve. The height is a grid's one row, 0fr to 1fr, the rows' own laid
 * out height, not Base UI's measured --collapsible-panel-height, a
 * scrollHeight that counts what reaches past the foot (a route's line, a
 * row's 44-point area) and so overshot. Its one child is clipped while it
 * grows and from the first frame it shrinks, and let past its foot only
 * once grown: overflow, a discrete property, turns visible a fold's time
 * after it opens, as Base UI marks only the first frame
 * (data-starting-style). The panel needs that one child, `<div>`. A
 * long fold, nine rows or more in it or in its list, opens and closes at
 * once: a grid's rows eased lay out every row anew each frame, and a
 * procedure's twenty fixes stuttered on a phone (the feel audit,
 * 2026-11-27); 0.01 ms, as Reduce Motion's, so its transitionend still
 * comes (onTheLine's FoldSection waits on it).
 */
export const FOLD_PANEL =
  "grid grid-rows-[1fr] transition-[grid-template-rows] duration-(--motion-fade) ease-(--motion-sheet-ease) [&:has(>div>:nth-child(9),>div>ol>:nth-child(9))]:duration-[0.01ms] data-ending-style:grid-rows-[0fr] data-starting-style:grid-rows-[0fr] [&>div]:min-h-0 [&>div]:overflow-hidden [&>div]:[transition:overflow_0s_var(--motion-fade)_allow-discrete] [&[data-open]:not([data-starting-style]):not([data-ending-style])>div]:overflow-visible data-ending-style:[&>div]:[transition:overflow_0s]";

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
