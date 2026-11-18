/** The first letter a capital, the rest as it is: "road or rail" as "Road
 *  or rail", a line of the app's own words opening a row. The FAA's own
 *  capitals are the engine's (lib/advisories' faaWords, titleCase). */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Each word's first letter a capital, spelled idents left as they are:
 *  "direct oshkosh" as "Direct Oshkosh", a chip's or a read line's words. */
export function eachCapitalised(words: string): string {
  return words.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}
