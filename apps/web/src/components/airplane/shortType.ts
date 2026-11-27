// The words after a maker's name the FAA's registry carries that say
// what kind of company it is, not who: "AIRBUS S A S", "PIPER AIRCRAFT
// INC", "CIRRUS DESIGN CORP".
const COMPANY = new Set([
  "AIRCRAFT",
  "AVIATION",
  "AEROSPACE",
  "DESIGN",
  "INDUSTRIES",
  "IND",
  "INC",
  "CORP",
  "CO",
  "COMPANY",
  "LLC",
  "LTD",
  "GMBH",
  "SA",
  "SAS",
]);

/** A name as it is written, where the registry has it in capitals. */
const cased = (word: string) => (/^[A-Z]{2,}$/.test(word) ? word[0] + word.slice(1).toLowerCase() : word);

/**
 * What an airplane is in a few words, its maker and its model without the
 * variant (the owner, 2026-11-27: "Maybe just Airbus A321"): "Airbus S A S"
 * and "A321-271NX" are "Airbus A321", "Piper" and "PA-28-140" "Piper
 * PA-28", "Boeing" and "737-8H4" "Boeing 737". A model starting with
 * letters alone keeps its number (PA-28, DHC-6); one whose first part has a
 * number in it is that part (A321, 737). The whole is the record's
 * sections'.
 */
export function shortType(manufacturer: string | null | undefined, model: string | null | undefined): string | null {
  const parts = (model ?? "").trim().split("-");
  const base = /^[A-Za-z]+$/.test(parts[0] ?? "") && parts.length > 1 ? parts.slice(0, 2).join("-") : (parts[0] ?? "");
  return [shortMaker(manufacturer), base].filter(Boolean).join(" ") || null;
}

/** Its maker alone, short: "AIRBUS S A S" is "Airbus", "PIPER AIRCRAFT
 *  INC" "Piper"; the facts strip's Make (the owner, 2026-11-27). */
export function shortMaker(manufacturer: string | null | undefined): string | null {
  const words = (manufacturer ?? "").trim().split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w, i) => i > 0 && (COMPANY.has(w.toUpperCase()) || w.length === 1));
  return (cut < 0 ? words : words.slice(0, cut)).map(cased).join(" ") || null;
}

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
