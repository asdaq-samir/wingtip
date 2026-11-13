import { useEffect, type ComponentProps } from "react";

/** Calls `onHidden` as a popup's anchor goes out of sight: Base UI's hide
 *  middleware, a Positioner's anchorHidden (data-anchor-hidden), which
 *  counts a clipping ancestor (the sheet) as out of sight. */
function AnchorHidden({ hidden, onHidden }: { hidden: boolean; onHidden: () => void }) {
  useEffect(() => {
    if (hidden) onHidden();
  }, [hidden, onHidden]);
  return null;
}

/** A Positioner's `render` that tells `onHidden` its anchor went out of
 *  sight; none without one. */
export function anchorHiddenRender(onHidden: (() => void) | undefined) {
  if (!onHidden) return undefined;
  return function withAnchor(props: ComponentProps<"div">, state: { anchorHidden: boolean }) {
    return (
      <div {...props}>
        {props.children}
        <AnchorHidden hidden={state.anchorHidden} onHidden={onHidden} />
      </div>
    );
  };
}
