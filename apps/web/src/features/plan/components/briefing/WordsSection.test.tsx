// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { WordsAnswer } from "../../../../lib/api/words";
import { notamCredit, notamNone } from "./briefingWords";
import WordsSection from "./WordsSection";
import { wordsState } from "./wordsState";

afterEach(cleanup);

const ANSWER: WordsAnswer = {
  sentences: [
    { text: "Duluth is reporting 12 knots gusting 18 from 270.", sources: ["metar:KDLH"] },
    { text: "The ceiling is 4,500 feet.", sources: ["metar:KDLH"] },
  ],
  sources: [{ id: "metar:KDLH", label: "METAR KDLH 1753Z", text: "KDLH 031753Z 27012G18KT 10SM BKN045 08/M02 A2992" }],
  model: "claude-haiku-5-5", unavailable: null,
};

describe("a section of words", () => {
  test("while the words are written it is a skeleton, not words", () => {
    render(<WordsSection title="Risk picture" testId="w" state={{ answer: undefined, error: null, pending: true }} />);
    expect(screen.getByTestId("w-pending")).toBeTruthy();
    expect(screen.queryByTestId("w-words")).toBeNull();
  });

  test("with the model unreachable it says so in the note's size and shows nothing else, no toast", () => {
    const unavailable: WordsAnswer = { sentences: [], sources: [], model: null, unavailable: "the model did not answer in time" };
    render(<WordsSection title="Risk picture" testId="w" state={wordsState({ data: unavailable, error: null })} />);
    expect(screen.getByTestId("w-unavailable").textContent).toBe("The model did not answer in time.");
    expect(screen.queryByTestId("w-words")).toBeNull();
    expect(screen.queryByTestId("w-source")).toBeNull();
    expect(document.querySelector("[data-sonner-toast]")).toBeNull();
  });

  test("a failed request reads the same way, with the error's own words", () => {
    render(<WordsSection title="Risk picture" testId="w" state={wordsState({ data: undefined, error: new Error("The planner is not answering") })} />);
    expect(screen.getByTestId("w-unavailable").textContent).toBe("The planner is not answering.");
  });

  test("the sentences read as one paragraph, each source one chip that opens the report as sent", () => {
    render(<WordsSection title="The weather, in words" testId="w" state={wordsState({ data: ANSWER, error: null })} />);
    expect(screen.getByTestId("w-words").textContent).toBe(ANSWER.sentences.map(s => s.text).join(" "));
    const chips = screen.getAllByTestId("w-source");
    expect(chips).toHaveLength(1);
    expect(chips[0]!.textContent).toBe("METAR KDLH 1753Z");
    fireEvent.click(chips[0]!);
    expect(screen.getByTestId("source-text").textContent).toBe(ANSWER.sources[0]!.text);
  });
});

describe("the NOTAMs' coverage", () => {
  test("the credit names the feed and the day it was first heard, in the app's date format", () => {
    expect(notamCredit("2026-10-19")).toBe("FAA NOTAM feed since 19 Oct 2026");
    expect(notamCredit(null)).toBe("FAA NOTAM feed");
  });

  test("an empty list reads none heard since the day, never no NOTAMs", () => {
    expect(notamNone("2026-10-19")).toBe("None heard since 19 Oct");
    expect(notamNone(undefined)).toBe("None heard");
    const answer: WordsAnswer = { sentences: [], sources: [], model: "m", unavailable: null, coverage_since: "2026-10-19" };
    render(<WordsSection title="NOTAMs that matter" testId="w" state={wordsState({ data: answer, error: null })}
      credit={notamCredit(answer.coverage_since)} empty={notamNone(answer.coverage_since)} />);
    expect(screen.getByTestId("w-empty").textContent).toBe("None heard since 19 Oct");
    expect(screen.getByTestId("w-credit").textContent).toBe("FAA NOTAM feed since 19 Oct 2026");
    expect(document.body.textContent).not.toMatch(/no notams/i);
    expect(screen.queryByTestId("w-words")).toBeNull();
  });

  test("with words, the credit still follows the chips", () => {
    render(<WordsSection title="NOTAMs that matter" testId="w" state={wordsState({ data: ANSWER, error: null })} credit={notamCredit("2026-10-19")} empty={notamNone("2026-10-19")} />);
    expect(screen.getByTestId("w-words")).toBeTruthy();
    expect(screen.getByTestId("w-credit").textContent).toBe("FAA NOTAM feed since 19 Oct 2026");
  });
});
