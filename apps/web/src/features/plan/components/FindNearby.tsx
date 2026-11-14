import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { PillSection } from "../../../components/Favorites";
import StopKindGlyph from "../../../components/StopKindGlyph";
import { KIND_ORDER, STOP_KINDS, type StopKind } from "../../../lib/stopKinds";
import { TEXT } from "../../../lib/text";

/** Find Nearby's tiles in Maps' order for them: food first. */
const NEARBY: StopKind[] = ["food", ...KIND_ORDER.filter((k) => k !== "food")];

/**
 * Find Nearby, at the foot of the one search's own page (SearchHome), as
 * Apple Maps' Find Nearby is under its Favorites (the owner's pick of the Stops canvas, E,
 * 2026-10-27): a tile for each kind of stop, two to a row, its glyph in
 * its colour and its name; a tap opens the Stops sheet round the pilot
 * with that kind picked.
 */
export default function FindNearby({ onFind }: { onFind: (kind: StopKind) => void }) {
  return (
    <PillSection title="Find Nearby" testId="find-nearby">
      <div className="grid grid-cols-2 gap-2">
        {NEARBY.map((kind) => (
          <BaseButton
            key={kind}
            onClick={() => onFind(kind)}
            data-testid={`find-nearby-${kind}`}
            className={cn(
              // White cards on the sheet's grey, as the rest of its page
              // is: the grey at 8% stood 1.19:1 against it (F-L2).
              "flex h-14 min-w-0 items-center gap-3 rounded-(--radius-card) bg-card px-3 text-left font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
              TEXT.row,
            )}
          >
            <StopKindGlyph kind={kind} className="size-9" />
            <span className="min-w-0 truncate">{STOP_KINDS[kind].tile}</span>
          </BaseButton>
        ))}
      </div>
    </PillSection>
  );
}
