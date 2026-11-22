import { describe, expect, it } from "vitest";
import type { CfrText } from "../../lib/api/types";
import { searchText, sectionAnchor, sectionFor } from "./textSearch";

const part91: CfrText = {
  head: "PART 91 - GENERAL OPERATING AND FLIGHT RULES",
  groups: [
    {
      head: "Subpart B - Flight Rules",
      sections: [
        {
          id: "91.151",
          head: "§ 91.151 Fuel requirements for flight in VFR conditions.",
          paragraphs: ["(a) No person may begin a flight in an airplane under VFR conditions unless ..."],
        },
        { id: "91.155", head: "§ 91.155 Basic VFR weather minimums.", paragraphs: ["(a) Except as provided in paragraph (b) ... VFR flight ... VFR"] },
      ],
    },
  ],
};

describe("a CFR part searched and found", () => {
  it("lists every place a word is found, its case aside, with the words round it", () => {
    const hits = searchText(part91, "vfr");
    expect(hits.map((h) => [h.section, h.paragraph])).toEqual([
      ["91.151", -1],
      ["91.151", 0],
      ["91.155", -1],
      ["91.155", 0],
      ["91.155", 0],
    ]);
    expect(hits[1]!.match).toBe("VFR");
    expect(hits[1]!.before.endsWith("airplane under ")).toBe(true);
  });

  it("asks two letters at least, and lands a cite on its section", () => {
    expect(searchText(part91, "v")).toEqual([]);
    expect(sectionFor(part91, "91.155")).toBe("91.155");
    expect(sectionFor(part91, "91.999")).toBeNull();
    expect(sectionAnchor("91.155")).toBe("sec-91.155");
  });
});
