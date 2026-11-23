import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

// Base UI's own delay (600 ms), not shadcn's 0, for the first label: a
// mouse crossing a row of buttons no longer pops each in turn over the
// next. Once one is up, the provider opens its neighbours at once
// (data-instant), as a Mac's toolbar does (main.tsx mounts it). A file of
// its own, apart from ui/tooltip: main.tsx imports it, and a module the
// first load shares with the popups' chunk is put in the first load
// whole, so with the tooltip's popup and positioner beside it the
// provider brought 50 KB of them there (first-load.mjs, 2026-11-23).
function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

export { TooltipProvider };
