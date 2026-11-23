import * as React from "react";
import { cn } from "cn";

// shadcn's Input as it is: the browser's own clear on a search field, its
// own Return. AutoFill off unless a field says otherwise: most of the
// app's fields are figures and idents, which Safari's AutoFill would offer
// a contact for (the iOS audit's P19). And its return key says Done, as
// an iOS text field's names its key (HIG, "Text fields"), unless a field
// names its own (Search, Next): a bare "return" was P19's finding on the
// Checkride's and the practice pages' fields. Its words 14 only with a
// mouse from md (md:pointer-fine), never to a finger: iOS zooms the page in
// on a field under 16 and does not zoom back, and an iPad is md wide (the
// Native look takes no pointer-coarse size).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      autoComplete="off"
      enterKeyHint="done"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:pointer-fine:text-sm pointer-coarse:text-(length:--type-row) dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
