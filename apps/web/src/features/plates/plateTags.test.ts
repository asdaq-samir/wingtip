import { describe, expect, it } from "vitest";
import type { ApproachFixTagsAnswer } from "../../lib/engine/contract";
import KOSH from "../../lib/fixtures/approachKosh.json";
import { tagViews } from "./plateTags";

// KOSH's ILS RWY 36 via OSH as the engine tags it (approach_fix_tags; the
// plate, ILS or LOC RWY 36 Amdt 7D: POBER at or above 2,700 with GS 2,610,
// CFBSM 2,700, TCH 53 and TDZE 809, the missed to LEWKO's hold at 3,000).
const tags = (KOSH as unknown as { tags: Record<string, ApproachFixTagsAnswer> }).tags["I36:OSH"]!.tags;

describe("KOSH ILS 36's tags on its plate", () => {
  const views = tagViews(tags);
  const of = (ident: string) => views.find((v) => v.ident === ident)!;

  it("bars POBER's altitude as the plate does and gives the glide slope there", () => {
    expect(of("POBER").lines).toEqual([
      { text: "2,700'", under: true, over: false },
      { text: "GS 2,610'", under: false, over: false },
    ]);
    expect(of("CFBSM").lines).toEqual([{ text: "2,700'", under: true, over: false }]);
  });

  it("gives the runway its TCH and TDZE, never a DA", () => {
    expect(of("RW36").lines.map((l) => l.text)).toEqual(["TCH 53'", "TDZE 809'"]);
  });

  it("names the missed approach's hold and its altitude", () => {
    expect(of("LEWKO").lines).toEqual([{ text: "3,000'", under: true, over: false }]);
  });

  it("names a fix with no altitude of its own", () => {
    expect(of("OSH").lines).toEqual([]);
  });
});
