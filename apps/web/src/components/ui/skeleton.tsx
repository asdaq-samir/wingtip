import * as React from "react";
import { cn } from "cn";

// The app's one skeleton, shadcn's: the shape of what is coming in the
// theme's accent, breathing once a motion.skeleton-pulse (design/tokens.json),
// as the phones' Skeleton does; held still with Reduce Motion.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent motion-safe:animate-pulse [animation-duration:var(--motion-skeleton-pulse)] rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
