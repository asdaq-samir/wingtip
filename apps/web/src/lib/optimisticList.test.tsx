// @vitest-environment jsdom
import { startTransition } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { changed, useOptimisticList } from "./optimisticList";

const rows = [
  { id: 1, name: "KMSN" },
  { id: 2, name: "KDLH" },
];

describe("a list changed in place", () => {
  it("puts a row in place of its own, adds a new one where the list wants it, and drops one", () => {
    expect(changed(rows, { put: { id: 2, name: "KRYV" } })).toEqual([rows[0], { id: 2, name: "KRYV" }]);
    expect(changed(rows, { put: { id: 3, name: "C81" } })[2]).toEqual({ id: 3, name: "C81" });
    expect(changed(rows, { put: { id: 3, name: "C81" }, first: true })[0]).toEqual({ id: 3, name: "C81" });
    expect(changed(rows, { drop: 1 })).toEqual([rows[1]]);
  });
});

describe("the list shown while the server answers", () => {
  it("shows the change at once, and the server's list once the Action ends: refused, as it was", async () => {
    let answer!: (ok: boolean) => void;
    const { result } = renderHook(() => useOptimisticList(rows));
    act(() =>
      startTransition(async () => {
        result.current[1]({ drop: 1 });
        // The server refusing: nothing put in the query's data.
        await new Promise<boolean>((resolve) => (answer = resolve));
      }),
    );
    expect(result.current[0]?.map((r) => r.id)).toEqual([2]);
    await act(async () => answer(false));
    expect(result.current[0]?.map((r) => r.id)).toEqual([1, 2]);
  });

  it("is undefined while the list is still fetched", () => {
    const { result } = renderHook(() => useOptimisticList<{ id: number }>(undefined));
    expect(result.current[0]).toBeUndefined();
  });
});
