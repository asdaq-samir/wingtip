import { lazyModule } from "../lib/lazyModule";
import { useMediaQuery } from "../hooks/use-media-query";
import type { SwipeRowProps } from "./swipe/SwipeRowImpl";

/** The swipe's chunk (components/swipe, Motion's drag with it): not in the
 *  first load, and asked for only where a finger can swipe. */
const swipe = lazyModule(() => import("./swipe"));

/**
 * A list's row that a swipe to the left takes away, as iOS's lists' rows
 * are (Mail, Reminders, Maps' Recents): its button uncovered, or the row
 * removed by a full swipe (components/swipe). A swipe is a finger's:
 * with a mouse, or until the chunk is in, the row is drawn as itself, its
 * Remove in its menu, where a keyboard and VoiceOver find it too. Off
 * (`off`) where the list is being edited, as iOS's lists in Edit swipe
 * nothing, the minus taking the row away.
 */
export function SwipeRow({ off = false, ...props }: SwipeRowProps & { off?: boolean }) {
  // A finger anywhere, not a primary pointer that is no mouse: an iPad
  // with a trackpad reports a fine pointer that hovers, and its rows did
  // not swipe under a finger (the r5-ui audit's L17).
  const finger = useMediaQuery("(any-pointer: coarse)");
  const module = swipe.use(finger && !off);
  if (!module || !finger || off) return props.children;
  return <module.SwipeRowImpl {...props} />;
}
