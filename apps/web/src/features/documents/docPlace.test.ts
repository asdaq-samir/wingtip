import { describe, expect, it } from "vitest";
import type { LibraryDocument } from "../../lib/api/types";
import { citedPlace, docLink, docPlaceText, isOwn, ownDocName, parseDocPlace } from "./docPlace";

const shelf = [
  {
    id: "cfr-14-91",
    title: "14 CFR Part 91",
    group: "Regulations",
    kind: "text",
    edition: "2026-11-10",
    label: "eCFR",
    date: "2026-11-10",
    bytes: 1,
  },
  { id: "aim", title: "AIM", group: "AIM", kind: "pdf", edition: null, label: null, date: null, bytes: null },
] satisfies LibraryDocument[];

describe("a document's place in the address", () => {
  it("reads a document alone, at a section or paragraph, and at a page", () => {
    expect(parseDocPlace("phak")).toEqual({ doc: "phak", at: null, page: null });
    expect(parseDocPlace("cfr-14-91@91.155")).toEqual({ doc: "cfr-14-91", at: "91.155", page: null });
    expect(parseDocPlace("aim@7-1-5")).toEqual({ doc: "aim", at: "7-1-5", page: null });
    expect(parseDocPlace("phak@p42")).toEqual({ doc: "phak", at: null, page: 42 });
    expect(parseDocPlace("own:0b6f9a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b")?.doc).toBe("own:0b6f9a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b");
  });

  it("reads nothing that could be a path or a script", () => {
    expect(parseDocPlace("../etc/passwd")).toBeNull();
    expect(parseDocPlace("")).toBeNull();
    expect(parseDocPlace("aim@<script>")).toEqual({ doc: "aim", at: null, page: null });
  });

  it("writes what it reads", () => {
    for (const text of ["phak", "cfr-14-91@91.155", "aim@7-1-5", "phak@p42"]) expect(docPlaceText(parseDocPlace(text)!)).toBe(text);
  });

  it("shares the library's places, never a pilot's own document", () => {
    expect(docLink({ doc: "aim", at: "7-1-5", page: null }, "https://wingtipmaps.app")).toBe(
      "https://wingtipmaps.app/app/plan?doc=aim%407-1-5",
    );
    expect(docLink({ doc: ownDocName("x1"), at: null, page: 3 }, "https://wingtipmaps.app")).toBeNull();
    expect(isOwn(ownDocName("x1"))).toBe(true);
  });

  it("links a cite only where the shelf holds its document in an edition", () => {
    const cite = { kind: "cfr", doc: "cfr-14-91", at: "91.155", paragraph: null } as const;
    expect(citedPlace(cite, shelf)).toEqual({ doc: "cfr-14-91", at: "91.155", page: null });
    // The AIM not had yet, Part 121 not on the shelf, no shelf at all: words.
    expect(citedPlace({ kind: "aim", doc: "aim", at: "7-1-5", paragraph: null }, shelf)).toBeNull();
    expect(citedPlace({ kind: "cfr", doc: "cfr-14-121", at: "121.5", paragraph: null }, shelf)).toBeNull();
    expect(citedPlace(cite, undefined)).toBeNull();
  });
});
