/**
 * A finger held on a pill till its menu opened, then lifted: the lift is
 * no tap. The browser follows a touch's end with a focus and a click on
 * what is under the finger -- the pill's own button, whose tap opens the
 * airport's card -- which took the menu away as the finger came up, so
 * its Move Down was never reached (integration's stops-reorder spec, "on
 * a touch screen", 2026-11-12). The pill asks this, at the touch's end,
 * whether to cancel them.
 */
export function holdGuard() {
  let touching = false;
  let held = false;
  return {
    /** A press begun: by a finger or not. */
    down(byTouch: boolean) {
      touching = byTouch;
      held = false;
    },
    /** The menu opened, by the hold where a finger is down. */
    opened() {
      if (touching) held = true;
    },
    /** The finger lifted: whether what the browser does next is cancelled. */
    lifted() {
      const cancel = held;
      touching = false;
      held = false;
      return cancel;
    },
  };
}
