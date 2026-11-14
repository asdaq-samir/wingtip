import { cn } from "cn";
import type { FoundPlace } from "../lib/clearance";

/** A place as found: its ident, or the words said where nothing was
 *  found, in amber where it was found by its sound only, for the pilot to
 *  check. */
export default function ClearancePlace({ place }: { place: FoundPlace }) {
  if (!place.ident)
    return (
      <span className="text-destructive" title="Not found">
        “{place.said}”?
      </span>
    );
  return (
    <span className={cn(!place.sure && "text-caution")} title={place.name ?? undefined}>
      {place.ident}
      {!place.sure && "?"}
    </span>
  );
}
