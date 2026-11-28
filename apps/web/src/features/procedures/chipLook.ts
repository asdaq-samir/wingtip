/** A field's chip after its runways, laid out in its row (the stock
 *  Button's `chip` size draws it): a kind to add whole ("+ APCH",
 *  "+ HOLD"), the row wrapping it under where it has no room -- shrunk, it
 *  read "+ A…" at the owner's text size (2026-11-13) -- or the one picked,
 *  its name kept to a chip ("ILS 26 ⌄"). ProcedureMenu's and HoldChip's. */
export function chipLook(add: boolean): string {
  return add ? "shrink-0 justify-start text-left font-semibold" : "min-w-0 max-w-[10rem] shrink justify-start text-left font-semibold";
}
