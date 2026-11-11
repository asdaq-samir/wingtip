import { Suspense, lazy, type ComponentProps } from "react";

/** The paywall's prompt on a chunk of its own, for a screen on the first
 *  load that shows it only past what is free (the checkpoint notes): 2.8 KB
 *  of the first load for every pilot (scripts/first-load.mjs's budget). */
const PaidPrompt = lazy(() => import("./PaidPrompt"));

export default function PaidPromptLazy(props: ComponentProps<typeof PaidPrompt>) {
  return (
    <Suspense fallback={null}>
      <PaidPrompt {...props} />
    </Suspense>
  );
}
