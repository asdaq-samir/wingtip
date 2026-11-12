import { describe, expect, it } from "vitest";
import { useTabSearch } from "../../lib/tabSearch";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { listSearchOf, nearSearch } from "./listSearch";

const vm = (over: Partial<PlanWorkspaceModel>) => ({ view: "search", nearOpen: false, ...over }) as PlanWorkspaceModel;

describe("the one search scoped to a list", () => {
  it("leaves the sheet's field the search's while Nearest is open: Nearest's is at its card's top", () => {
    // The card is a drawer over the sheet, so a field on the sheet's first
    // row was under it (nearest.spec's smoke test, 2026-11-12).
    expect(listSearchOf(vm({ nearOpen: true }))).toBeNull();
  });

  it("is Nearest's place in the card: what is typed, its words and its clear back to the position", () => {
    const field = nearSearch("madison");
    expect(field).toMatchObject({ value: "madison", placeholder: "Current position", testId: "nearest-from" });
    field.onChange("oshkosh");
    expect(useTabSearch.getState().near).toBe("oshkosh");
    field.onClear?.();
    expect(useTabSearch.getState().near).toBe("");
  });
});
