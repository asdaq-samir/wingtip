import * as React from "react";
import { cn } from "cn";

// The app's one skeleton, shadcn's: the shape of what is coming in the
// theme's accent, breathing once a motion.skeleton-pulse (design/tokens.json),
// as the phones' Skeleton does; held still with Reduce Motion. It waits a
// moment before it shows (index.css's skeleton rule), so an answer already
// fetched never flashes a skeleton for a frame or two.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("bg-accent rounded-md", className)} {...props} />;
}

export { Skeleton };
