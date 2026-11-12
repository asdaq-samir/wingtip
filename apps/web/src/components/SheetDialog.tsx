import { Suspense, lazy, useEffect, useState, type ComponentProps } from "react";

/** The dialog itself (SheetDialogBody): Base UI's Drawer, Dialog and
 *  AlertDialog, about 36 KB that the first load does not draw. */
const loadBody = () => import("./SheetDialogBody");
const Body = lazy(loadBody);

/** Asked for once, after the page has drawn, so a box opens at once. */
let asked = false;

/**
 * Every box that asks something of the pilot over the page (SheetDialogBody
 * says how it looks): a sign-in, a failure, a confirmation. On its own
 * chunk until one first opens -- nearly every page load opens none, and
 * the error box, the confirmations and the sign-in link's sheet are all
 * mounted from the start -- read ahead two seconds after the page draws,
 * as the pilot's console is (usePlanWorkspace). Once opened it stays
 * drawn, so it closes with its own motion.
 */
export default function SheetDialog(props: ComponentProps<typeof Body>) {
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  useEffect(() => {
    if (asked) return;
    asked = true;
    window.setTimeout(() => void loadBody(), 2000);
  }, []);
  if (!opened && !props.trigger) return null;
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}
