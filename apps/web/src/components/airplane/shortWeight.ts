/** The registry's weight class written short for the strip: "Up to
 *  12,499 lb" is "≤12,499 lb", "12,500 to 19,999 lb" "12,500–19,999 lb",
 *  "20,000 lb and over" "≥20,000 lb"; the whole of it in the Airplane section. */
export const shortWeight = (words: string | null | undefined) =>
  words
    ? words
        .replace(/^(?:UAV )?up to /i, "≤")
        .replace(/^(.+) and over$/, "≥$1")
        .replace(" to ", "–")
    : null;
