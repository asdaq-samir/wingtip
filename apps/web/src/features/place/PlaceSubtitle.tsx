import { Button as BaseButton } from "@base-ui/react/button";
import FitLine from "../../components/FitLine";
import StatusBadge from "../../components/StatusBadge";
import type { AirportPlace } from "../../lib/api/types";
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
 * permission required"), or NASR's closed label (decision 0043), each a
 * status badge, as the search's rows and Nearest show them (rules.md §9;
 * the selection audit, 2026-11-18: they were red and grey words), a
 * joint-use field's too; beside the name in brackets, it cut a long name to
 * a few letters at an iPhone's width. After the name, whether the field has
 * a control tower, "Towered" or "Non-towered" (NASR's tower type, the
 * planner's `towered`), as Maps says a place's kind beside its name (the
 * owner, 2026-11-14, C1 on the canvas V1d9RDbmY1aczc4LfXed7a): the name
 * fitted to the room left.
 */
export function PlaceSubtitle({
  ident,
  place,
  name,
  kind,
  tower,
}: {
  ident: string;
  place: AirportPlace | undefined;
  /** Its name, where it is not the ident itself. */
  name: string | null;
  /** Its use line, or its closed label. */
  kind: string | null;
  /** "Towered" or "Non-towered" once the answer is in. */
  tower: string | null;
}) {
  const mark = useNotamMarks(ident, place).field;
  const sheet = useNotamSheet();
  // Who may use it, or that it is closed, as a badge (StatusBadge's
  // closed, military, joint, private), its words the engine's or NASR's.
  const status = place?.closed
    ? "closed"
    : place?.military === "military"
      ? "military"
      : place?.military === "joint"
        ? "joint"
        : place?.private
          ? "private"
          : null;
  const kindLine = status && (
    <span className="block text-center" data-testid="place-status">
      <StatusBadge variant={status} data-testid="place-kind">
        {kind ?? undefined}
      </StatusBadge>
    </span>
  );
  const towerWords = tower && (
    <span className="shrink-0 whitespace-nowrap">
      {name ? (
        <span aria-hidden className="whitespace-pre">
          {" "}
          ·{" "}
        </span>
      ) : null}
      {tower}
    </span>
  );
  if (!name && !mark && !tower) return kindLine || null;
  const words = (
    <>
      {name && <FitLine className="min-w-0">{name}</FitLine>}
      {towerWords}
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
      <BaseButton
        onClick={() => sheet.show(mark)}
        className="relative flex min-w-0 items-center justify-center gap-2 outline-none after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="place-full-name"
      >
        {words}
      </BaseButton>
      {kindLine}
      {sheet.shown && <NotamSheet notams={sheet.shown} ident={place?.ident ?? ident} onClose={sheet.close} />}
    </>
  );
}
