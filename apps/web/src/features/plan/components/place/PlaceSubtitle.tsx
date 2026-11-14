import { cn } from "cn";
import FitLine from "../../../../components/FitLine";
import type { AirportPlace } from "../../../../lib/api/types";
import { NotamBadge, NotamSheet } from "./NotamBadge";
import { useNotamMarks, useNotamSheet } from "./notamBadges";

/**
 * The airport card's head's second line: its full name, centred under the
 * ident and fitted to it, and a NOTAM's badge after it where one closes the
 * field or a TFR is near it (the owner, 2026-11-11: "For anything the notam
 * addresses, just put a badge next to it"). With a badge the line is a
 * button that opens that NOTAM over the card ("tapping the affected thing
 * should show the notam"), its hit area 44 points by a pseudo-element, the
 * line no taller. Under it, the field's one use line where it has one (the
 * owner, 2026-11-13: one line on every app, the engine's words, "Private:
 * permission required"), or NASR's closed label in the warning ink
 * (decision 0043): beside the name in brackets, it cut a long name to a
 * few letters at an iPhone's width.
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
  /** Its use line, or its closed label. */
  kind: string | null;
}) {
  const mark = useNotamMarks(ident, place).field;
  const sheet = useNotamSheet();
  const kindLine = kind && (
    <span className={cn("block truncate text-center", place?.closed && "font-semibold text-destructive-ink")} data-testid="place-kind">
      {kind}
    </span>
  );
  if (!name && !mark) return kindLine || null;
  const words = (
    <>
      {name && <FitLine className="min-w-0">{name}</FitLine>}
      {mark && <NotamBadge mark={mark} kind="field" />}
    </>
  );
  if (!mark)
    return (
      <>
        <span className="flex min-w-0 justify-center" data-testid="place-full-name">
          {words}
        </span>
        {kindLine}
      </>
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
      {kindLine}
      {sheet.shown && <NotamSheet notams={sheet.shown} ident={place?.ident ?? ident} onClose={sheet.close} />}
    </>
  );
}
