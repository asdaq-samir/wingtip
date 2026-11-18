import { ChevronDown } from "lucide-react";
import { Button } from "../../components/ui/button";
import { bearing } from "../../lib/format";
import { holdWords, type Hold } from "../plan";
import { chipLook } from "./chipLook";

/**
 * The destination's hold, a chip after its procedures' on its line of
 * FPL's timeline (the owner, 2026-11-18): "+ HOLD", the FAA's word as the
 * others are contractions (FAA Order JO 7340.2: ARR, APCH, DEP), where
 * none is set; once one is, the hold as the others say their pick, its
 * inbound course and turns ("Hold 270° R ⌄"), a reader hearing it whole
 * (holdWords). A tap opens the hold sheet (HoldSheet), as the point's
 * menu's Hold does.
 */
export function HoldChip({ ident, hold, onOpen }: { ident: string; hold: Hold | null; onOpen: () => void }) {
  return (
    <Button
      variant="glass"
      type="button"
      onClick={onOpen}
      data-testid="hold-chip"
      data-look={hold ? "chip" : "add"}
      className={chipLook(!hold)}
      aria-label={`${ident} hold: ${hold ? holdWords(hold) : "none set"}`}
    >
      {hold ? (
        <>
          <span className="truncate">
            Hold {bearing(hold.inbound)} {hold.right ? "R" : "L"}
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      ) : (
        <span>+ HOLD</span>
      )}
    </Button>
  );
}
