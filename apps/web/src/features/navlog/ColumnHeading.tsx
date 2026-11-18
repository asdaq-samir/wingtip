import Explain from "../../components/Explain";
import { EXPLAINED, type ExplainedTerm } from "../../lib/explain";

/** A heading's unit, under its name, in its own small letters: 11, and
 *  a note's 13 to a finger. */
const UNIT =
  "text-(length:--type-caption) font-normal normal-case tracking-normal pointer-coarse:text-(length:--type-note) pointer-coarse:leading-[1.125rem]";

/** A column's heading: its short name over its unit, small, so both
 *  fit a phone's narrow columns ("Alt" over "ft", "MH" over "mag"), and
 *  its whole name for a screen reader, which read "MH" as "M H". */
export function Heading({ name, unit, spoken }: { name: string; unit?: string; spoken: string }) {
  // An abbreviation a pilot may not know is a tap for its meaning
  // (components/Explain; decision 0045), named whole for a screen reader.
  if (name in EXPLAINED)
    return (
      <span className="inline-flex flex-col items-end leading-[1.125rem]">
        <Explain term={name as ExplainedTerm} spoken={spoken} />
        {unit && (
          <span aria-hidden className={UNIT}>
            {unit}
          </span>
        )}
      </span>
    );
  return (
    <>
      {/* At a note's own leading (18 over 13), as iOS sets it. */}
      <span aria-hidden className="inline-flex flex-col items-end leading-[1.125rem]">
        <span>{name}</span>
        {unit && <span className={UNIT}>{unit}</span>}
      </span>
      <span className="sr-only">{spoken}</span>
    </>
  );
}
