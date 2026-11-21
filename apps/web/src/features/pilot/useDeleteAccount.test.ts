import { describe, expect, it, vi } from "vitest";
import { forgetAccountOnThisDevice, forgetThisDevice } from "./useDeleteAccount";
import { forgetWhereTheyFlew } from "./useLogout";

vi.mock("./useLogout", () => ({ forgetWhereTheyFlew: vi.fn() }));

/** The part of Storage forgetThisDevice reads, kept in a Map. */
function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

describe("forgetThisDevice", () => {
  it("removes what the app keeps under its prefix and nothing else", () => {
    const storage = fakeStorage({ "wingtip.preferences": "1", "wingtip.track.7": "[]", "wingtip.drills": "2", "other.key": "3" });
    forgetThisDevice(storage);
    expect(Array.from({ length: storage.length }, (_, i) => storage.key(i))).toEqual(["other.key"]);
  });

  it("leaves an empty storage empty", () => {
    const storage = fakeStorage({});
    forgetThisDevice(storage);
    expect(storage.length).toBe(0);
  });
});

describe("forgetAccountOnThisDevice", () => {
  it("forgets this tab's copies and what signing out forgets, not only localStorage", () => {
    // The deep security review of 2026-11-21: deleting kept the planner's
    // answers at the pilot's points, the tracks and trail, and the tab's
    // plan history, which Log Out forgot.
    const local = fakeStorage({ "wingtip.preferences": "1", "other.key": "3" });
    const session = fakeStorage({ "wingtip.planHistory": "[]", "other.tab": "4" });
    forgetAccountOnThisDevice(local, session);
    expect(local.length).toBe(1);
    expect(session.getItem("wingtip.planHistory")).toBeNull();
    expect(session.getItem("other.tab")).toBe("4");
    expect(forgetWhereTheyFlew).toHaveBeenCalledOnce();
  });
});
