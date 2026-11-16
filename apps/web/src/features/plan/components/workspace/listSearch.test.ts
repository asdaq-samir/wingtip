import { describe, expect, it } from "vitest";
import { useTabSearch } from "../../lib/tabSearch";
import { nearSearch } from "./listSearch";

describe("Nearest's field", () => {
  it("is Nearest's place in the card: what is typed, its words and its clear back to the position", () => {
    const field = nearSearch("madison");
    expect(field).toMatchObject({ value: "madison", placeholder: "Current position", testId: "nearest-from" });
    field.onChange("oshkosh");
    expect(useTabSearch.getState().near).toBe("oshkosh");
    field.onClear?.();
    expect(useTabSearch.getState().near).toBe("");
  });
});
