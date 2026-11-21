import { describe, expect, it } from "vitest";
import type { LibraryDocument } from "../../lib/api/types";
import {
  addOwn,
  forgetDoc,
  keepDoc,
  keptBody,
  keptDocs,
  ownBlob,
  ownDocs,
  removeOwn,
  renameOwn,
  restoreOwn,
  staleKept,
  type FileStore,
} from "./deviceFiles";

/** The device's store in memory, as idb-keyval keeps it in IndexedDB. */
function memory(): FileStore {
  const kept = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => kept.get(key) as T | undefined,
    set: async (key, value) => void kept.set(key, value),
    del: async (key) => void kept.delete(key),
    update: async <T,>(key: string, change: (old: T | undefined) => T) => void kept.set(key, change(kept.get(key) as T | undefined)),
  };
}

const pdf = (name: string) => Object.assign(new Blob(["%PDF-1.7"], { type: "application/pdf" }), { name });
const phak = (edition: string): LibraryDocument => ({
  id: "phak",
  title: "Pilot's Handbook of Aeronautical Knowledge",
  group: "Handbooks",
  kind: "pdf",
  edition,
  label: edition,
  date: "2026-11-03",
  bytes: 8,
});

describe("the documents kept on this device", () => {
  it("adds the pilot's own, renames it, deletes it and puts it back with its Undo", async () => {
    const s = memory();
    const poh = await addOwn(s, pdf("C172S POH.pdf"), "a");
    await addOwn(s, pdf("Club rules.pdf"), "b");
    expect(poh.name).toBe("C172S POH");
    await renameOwn(s, "a", "  POH  ");
    await renameOwn(s, "b", "   ");
    expect((await ownDocs(s)).map((d) => d.name)).toEqual(["POH", "Club rules"]);
    const taken = await removeOwn(s, "a");
    expect((await ownDocs(s)).map((d) => d.id)).toEqual(["b"]);
    expect(await ownBlob(s, "a")).toBeUndefined();
    await restoreOwn(s, taken!);
    expect((await ownDocs(s)).map((d) => d.id)).toEqual(["a", "b"]);
    expect((await ownBlob(s, "a"))?.size).toBe(8);
  });

  it("keeps a library document in its edition, a new edition in the old one's place", async () => {
    const s = memory();
    await keepDoc(s, phak("FAA-H-8083-25B"), pdf("x"));
    await keepDoc(s, phak("FAA-H-8083-25C"), pdf("x"));
    expect(await keptDocs(s)).toEqual([expect.objectContaining({ doc: "phak", edition: "FAA-H-8083-25C", bytes: 8 })]);
    expect((await keptBody(s, "phak"))?.edition).toBe("FAA-H-8083-25C");
    await forgetDoc(s, "phak");
    expect(await keptDocs(s)).toEqual([]);
    expect(await keptBody(s, "phak")).toBeUndefined();
  });

  it("names the kept documents the shelf has a newer edition of", async () => {
    const s = memory();
    await keepDoc(s, phak("FAA-H-8083-25B"), pdf("x"));
    const kept = await keptDocs(s);
    expect(staleKept(kept, [phak("FAA-H-8083-25B")])).toEqual([]);
    expect(staleKept(kept, [phak("FAA-H-8083-25C")]).map((d) => d.edition)).toEqual(["FAA-H-8083-25C"]);
    // The shelf without an edition (not had yet) keeps what is on board.
    expect(staleKept(kept, [{ ...phak("x"), edition: null }])).toEqual([]);
  });
});
