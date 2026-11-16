import { ListGroup, ListRow } from "../../../../components/GroupedList";
import FindingIcon from "../../../../components/FindingIcon";
import { useVerdict } from "../../../../lib/verdict";
import { findingRows } from "../../hooks/planWords";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/** As many findings as FPL says in full; the rest one row to the Brief. */
const SHOWN = 3;

/**
 * What the tiles' dots were, in words, under FPL's tiles (the owner's pick
 * of the routes canvas, board 5, 2026-11-16, Hr6eKFhyFBLjAAAmEaq8HB): a red
 * dot on Brief and an amber one on Profile said there was something, not
 * what. Each finding to act on is a row, its label and the engine's line
 * for it (gonogo verdict_items: "6.2 gal short of the fuel and its 45 min
 * reserve (14 CFR 91.151)"), red first; a tap opens the Brief, where it
 * unfolds to why, or the Profile for the altitude's own caution. Past three,
 * one row says how many more. Nothing found, nothing drawn. On the ground
 * only, right after the Routes' chips (AfterRouteLine; FplRoute in Route
 * Cards, whose chips are over the figures).
 */
export function FplFindings({ vm }: { vm: PlanWorkspaceModel }) {
  const items = useVerdict((v) => v.items);
  const { routed } = vm.route;
  const { flying } = vm.flight;
  const { openBrief, openProfile } = vm.fpl;
  const { altitudeMark, tightLeg, profileCautions } = vm.brief;
  if (!routed || flying) return null;
  const rows = findingRows(items).map((r) => ({ ...r, open: openBrief }));
  // The Profile's own caution -- the pilot's altitude, or a leg with no
  // room for a 500-ft step -- where the Brief's altitude says nothing of it.
  if (altitudeMark && !rows.some((r) => r.key === "altitude")) {
    rows.push({
      key: "profile",
      finding: "caution",
      label: "Profile",
      detail: tightLeg ?? profileCautions[0] ?? "Your altitude has a caution",
      open: openProfile,
    });
  }
  if (!rows.length) return null;
  const more = rows.length - SHOWN;
  const shown = more > 1 ? rows.slice(0, SHOWN) : rows;
  return (
    <div className="pt-1 pb-1" data-testid="fpl-findings">
      <ListGroup>
        {shown.map((r) => (
          <ListRow
            key={r.key}
            media={<FindingIcon finding={r.finding} className="size-5" />}
            title={
              <span className="line-clamp-2">
                <span className="font-semibold">{r.label}:</span> {r.detail}
              </span>
            }
            chevron
            onClick={r.open}
            data-testid={`fpl-finding-${r.key}`}
            data-finding={r.finding}
          />
        ))}
        {more > 1 && <ListRow title={`${more} more in the Brief`} chevron onClick={openBrief} data-testid="fpl-finding-more" />}
      </ListGroup>
    </div>
  );
}
