import { Suspense, type ComponentProps } from "react";
import { ShareMenuPart } from "./shareMenuChunk";

/** The route's Share and More menu from its chunk (shareMenuChunk), its
 *  button's room kept until the chunk is in. */
export function ShareMenu(props: ComponentProps<typeof ShareMenuPart>) {
  return (
    <Suspense fallback={<div className={props.card === undefined ? "size-8 shrink-0" : "size-9 shrink-0"} />}>
      <ShareMenuPart {...props} />
    </Suspense>
  );
}
