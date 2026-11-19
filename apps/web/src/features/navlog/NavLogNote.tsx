import { isLegPoint, legOf, phaseOf, rowPoint, type Description, type NavLogRow } from "../plan";
import { LegPointNote } from "./LegPointNote";
import { DescriptionCell } from "./DescriptionCell";
import { LegLine } from "./NavLogLegLine";

/** What opens under a row -- the selected one on screen, every one on
 *  paper: the leg's figures a phone has no room for, and the checkpoint's
 *  description or the field's name, the training drawer's rating buttons'
 *  way: every row open at once was three lines a waypoint, and a log of
 *  twenty scrolled for a screen and a half. */
export function NavLogNote({
  r,
  rowSelected,
  descriptions,
  onSaveDescription,
  onSelectPoint,
}: {
  r: NavLogRow;
  rowSelected: boolean;
  descriptions: Record<string, Description>;
  onSaveDescription: (lat: number, lon: number, text: string) => Promise<unknown>;
  onSelectPoint: (lat: number, lon: number) => void;
}) {
  const leg = legOf(r);
  return (
    <>
      {leg && <LegLine leg={leg} at={rowPoint(r)} phase={phaseOf(r)} />}
      {r.kind === "departure" ? (
        // The departure airport's own name, not editable and never
        // AI-generated -- there's no "how to spot it" for an airport and
        // no LLM service behind this one, just a fact the course
        // response already carries. Same slot a checkpoint's own
        // description sits in, so the pair still reads as one group.
        (r.airport.name ?? "—")
      ) : isLegPoint(r) ? (
        <LegPointNote point={r.point} descent={r.kind === "tod" ? r.point : null} />
      ) : r.kind === "checkpoint" ? (
        <DescriptionCell
          description={descriptions[r.key]}
          onSave={(text) => onSaveDescription(r.cp.lat, r.cp.lon, text)}
          selected={rowSelected}
          onFocus={() => onSelectPoint(r.cp.lat, r.cp.lon)}
        />
      ) : (
        // The destination airport's own name -- the same plain,
        // non-editable treatment as the departure's.
        (r.airport.name ?? "—")
      )}
    </>
  );
}
