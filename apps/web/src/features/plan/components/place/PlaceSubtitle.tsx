import FitLine from "../../../../components/FitLine";
import type { AirportPlace } from "../../../../lib/api/types";
import { NotamBadge, NotamSheet } from "./NotamBadge";
import { useNotamMarks, useNotamSheet } from "./notamBadges";

/**
 * The airport card's head's second line: its full name, centred under the
 * ident and fitted to it, "(Private)" after it where it is, and a NOTAM's
 * badge after that where one closes the field or a TFR is near it (the
 * owner, 2026-11-11: "For anything the notam addresses, just put a badge
 * next to it"). With a badge the line is a button that opens that NOTAM
 * over the card ("tapping the affected thing should show the notam"), its
 * hit area 44 points by a pseudo-element, the line no taller. The kind and
 * the badge are kept whole past the name, which alone shrinks or is cut.
 */
export function PlaceSubtitle({
  ident,
  place,
  name,
  kind,
}: {
  ident: string;
  place: AirportPlace | undefined;
  /** Its name, where it is not the ident itself. */
  name: string | null;
  kind: string | null;
}) {
  const mark = useNotamMarks(ident, place).field;
  const sheet = useNotamSheet();
  if (!name && !mark) return null;
  const words = (
    <>
      {name && <FitLine className="min-w-0">{name}</FitLine>}
      {name && kind && <span className="shrink-0 whitespace-pre" data-testid="place-kind">{` (${kind})`}</span>}
      {mark && <NotamBadge mark={mark} kind="field" />}
    </>
  );
  if (!mark)
    return (
      <span className="flex min-w-0 justify-center" data-testid="place-full-name">
        {words}
      </span>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => sheet.show(mark)}
        className="relative flex min-w-0 items-center justify-center gap-2 outline-none after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="place-full-name"
      >
        {words}
      </button>
      {sheet.shown && <NotamSheet notams={sheet.shown} ident={place?.ident ?? ident} onClose={sheet.close} />}
    </>
  );
}
