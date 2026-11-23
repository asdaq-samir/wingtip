import { Suspense, useEffect, useState, type ComponentProps } from "react";
import { fromChunk } from "../lib/fromChunk";
import { afterRouteDrawn } from "../lib/routeDrawn";

/** The dialog itself (SheetDialogBody): Base UI's Drawer, Dialog and
 *  AlertDialog, about 36 KB that the first load does not draw. Drawn
 *  straight from its module once it is in (fromChunk), where `lazy`
 *  suspended the first box opened once more, its chunk long fetched: FPL's
 *  fuel gauge's first sheet took 529 ms where the next took about 200 (the
 *  speed audit of 2026-11-21). */
const { Part: Body, prefetch: loadBody } = fromChunk(
  () => import("./SheetDialogBody"),
  (m) => m.default,
);

/** Asked for once, after the route opened has drawn, so a box opens at once. */
let asked = false;

/**
 * Every box that asks something of the pilot over the page (SheetDialogBody
 * says how it looks): a sign-in, a failure, a confirmation. On its own
 * chunk until one first opens -- nearly every page load opens none, and
 * the error box, the confirmations and the sign-in link's sheet are all
 * mounted from the start -- read ahead two seconds after the route opened
 * has drawn (lib/routeDrawn), as the pilot's console is. Once opened it stays
 * drawn, so it closes with its own motion.
 */
export default function SheetDialog(props: ComponentProps<typeof Body>) {
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  useEffect(() => {
    if (asked) return;
    asked = true;
    afterRouteDrawn(loadBody, 2000);
  }, []);
  if (!opened && !props.trigger) return null;
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}
