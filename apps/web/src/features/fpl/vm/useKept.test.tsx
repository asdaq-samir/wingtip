// @vitest-environment jsdom
/**
 * The planner's view model's slices kept while nothing in them changes
 * (useKept), so a part handed them is not drawn again when another slice
 * changes, nor at a render that changed nothing it reads (the speed work,
 * 2026-11-27). Drawn through React's Profiler, which reports each commit
 * a part took part in.
 */
import { Profiler } from "react";
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useKept } from "./useKept";
import { sameFields, useSteady } from "../../../lib/steady";

afterEach(cleanup);

describe("sameFields", () => {
  test("the same values under the same keys", () => {
    const f = () => 1;
    expect(sameFields({ a: 1, f }, { a: 1, f })).toBe(true);
    expect(sameFields([1, "x"], [1, "x"])).toBe(true);
    expect(sameFields({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
  });

  test("a value, a key or the kind differs", () => {
    expect(sameFields({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameFields({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameFields({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameFields({ a: {} }, { a: {} })).toBe(false);
    expect(sameFields([], {})).toBe(false);
  });
});

describe("useKept", () => {
  test("the object first made while its values are the same, a new one once one changes", () => {
    const { result, rerender } = renderHook(({ n }) => useKept({ n, word: "a" }), { initialProps: { n: 1 } });
    const first = result.current;
    rerender({ n: 1 });
    expect(result.current).toBe(first);
    rerender({ n: 2 });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ n: 2, word: "a" });
  });
});

describe("useSteady", () => {
  test("one function at every render, calling the latest", () => {
    const seen = vi.fn();
    const { result, rerender } = renderHook(({ n }) => useSteady(() => seen(n)), { initialProps: { n: 1 } });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
    result.current();
    expect(seen).toHaveBeenCalledWith(2);
  });
});

/** A slice as the view model's hooks make it: afresh at each render. */
function useSlice(n: number, kept: boolean) {
  "use no memo";
  const slice = { n, label: `n ${n}` };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- one branch for the whole test
  return kept ? useKept(slice) : slice;
}

/** A part of the view handed one slice (as PlanWorkspace hands its parts theirs). */
function Part({ vm }: { vm: { route: { label: string } } }) {
  return <span>{vm.route.label}</span>;
}

const commits = vi.fn();

/** The workspace: a render of its own (`tick`: the minute's clock, another slice) changing nothing the part reads. */
function Workspace({ kept, n, tick }: { kept: boolean; n: number; tick: number }) {
  const route = useSlice(n, kept);
  return (
    <>
      <i>{tick}</i>
      <Profiler id="part" onRender={commits}>
        <Part vm={{ route }} />
      </Profiler>
    </>
  );
}

describe("a part handed a kept slice", () => {
  test("is not drawn again at a render that changed nothing it reads, and is once its slice changes", () => {
    commits.mockClear();
    const { rerender } = render(<Workspace kept n={1} tick={0} />);
    rerender(<Workspace kept n={1} tick={1} />);
    rerender(<Workspace kept n={1} tick={2} />);
    expect(commits).toHaveBeenCalledTimes(1);
    rerender(<Workspace kept n={2} tick={2} />);
    expect(commits).toHaveBeenCalledTimes(2);
  });

  test("where a slice made afresh drew it again at every render", () => {
    commits.mockClear();
    const { rerender } = render(<Workspace kept={false} n={1} tick={0} />);
    rerender(<Workspace kept={false} n={1} tick={1} />);
    rerender(<Workspace kept={false} n={1} tick={2} />);
    expect(commits).toHaveBeenCalledTimes(3);
  });
});
