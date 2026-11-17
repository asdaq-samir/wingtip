/** A name in the FAA's or a registry's capitals as a name is written:
 *  "AIRBUS A-321neo" as "Airbus A-321neo", "UNITED AIRLINES INC" as
 *  "United Airlines Inc"; its codes (a single letter, a figure) kept. */
// A model's designator kept as written -- "PA-28", "DA-40", "A-321" -- where
// the word before its number read "Pa-28" in the card's subtitle.
export const nameCase = (text: string) => text.replace(/\b[A-Z]{2,}\b(?!-\d)/g, (word) => word[0] + word.slice(1).toLowerCase());
