import { cn } from "cn";
import { CAPSULE_HIT } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";

/** A field's chip after its runways, the stock Button's glass: a kind to
 *  add whole ("+ APCH", "+ HOLD"), the row wrapping it under where it has
 *  no room -- shrunk, it read "+ A…" at the owner's text size
 *  (2026-11-13) -- or the one picked, its name kept to a chip ("ILS 26 ⌄").
 *  ProcedureMenu's and HoldChip's, one look. */
export function chipLook(add: boolean): string {
  return cn(
    CAPSULE_HIT,
    "h-8 justify-start gap-0.5 text-left font-semibold",
    add ? "shrink-0 px-3" : "min-w-0 shrink max-w-[10rem] px-2.5",
    TEXT.detail,
  );
}
