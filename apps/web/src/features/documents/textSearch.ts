import type { CfrText } from "../../lib/api/types";

/** A place a search found in a CFR part: its section, the paragraph, and
 *  the words round the match to show in the results. */
export interface TextHit {
  section: string;
  paragraph: number;
  before: string;
  match: string;
  after: string;
}

/** Words either side of a match in its result's row. */
const AROUND = 40;
/** The most results listed: past that the pilot types more. */
export const MOST_HITS = 200;

/** Every place `query` is found in the part, in its order, its case
 *  aside; a section's number and heading count as its text. */
export function searchText(text: CfrText | undefined, query: string): TextHit[] {
  const wanted = query.trim().toLowerCase();
  if (!text || wanted.length < 2) return [];
  const hits: TextHit[] = [];
  for (const group of text.groups) {
    for (const section of group.sections) {
      const lines = [section.head, ...section.paragraphs];
      for (let i = 0; i < lines.length && hits.length < MOST_HITS; i++) {
        const line = lines[i]!;
        const lower = line.toLowerCase();
        for (let at = lower.indexOf(wanted); at >= 0 && hits.length < MOST_HITS; at = lower.indexOf(wanted, at + wanted.length)) {
          hits.push({
            section: section.id,
            // The heading is -1: the section's head, not a paragraph.
            paragraph: i - 1,
            before: (at > AROUND ? "…" : "") + line.slice(Math.max(0, at - AROUND), at),
            match: line.slice(at, at + wanted.length),
            after: line.slice(at + wanted.length, at + wanted.length + AROUND) + (at + wanted.length + AROUND < line.length ? "…" : ""),
          });
        }
      }
    }
  }
  return hits;
}

/** A section's element id in the reader, by its number: "sec-91.155". */
export const sectionAnchor = (id: string) => `sec-${id.replace(/[^A-Za-z0-9.-]/g, "_")}`;

/** The section `at` names ("91.155"), or the one an appendix is. */
export function sectionFor(text: CfrText | undefined, at: string | null): string | null {
  if (!text || !at) return null;
  for (const group of text.groups) for (const section of group.sections) if (section.id === at) return section.id;
  return null;
}
