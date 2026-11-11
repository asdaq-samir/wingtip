"use client";

import * as React from "react";
import { cn } from "cn";

// A plain label, as shadcn's Base UI style has it: Base UI has no Label
// primitive (Radix's only stopped a double click selecting its words).
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // eslint-disable-next-line jsx-a11y-x/label-has-associated-control -- its control is the caller's, by htmlFor or inside it.
    <label
      data-slot="label"
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm pointer-coarse:text-(length:--type-row) leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
