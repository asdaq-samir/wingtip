// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { WordsAnswer } from "../../../../lib/api/words";
import { wordsState } from "../../../../lib/wordsState";
import WordsSection from "../../../../components/WordsSection";
import { notamCredit, notamNone } from "../../../../lib/notamCoverage";

afterEach(cleanup);

const ANSWER: WordsAnswer = {
  sentences: [
    { text: "Duluth is reporting 12 knots gusting 18 from 270.", sources: ["metar:KDLH"] },
    { text: "The ceiling is 4,500 feet.", sources: ["metar:KDLH"] },
  ],
  sources: [{ id: "metar:KDLH", label: "METAR KDLH 1753Z", text: "KDLH 031753Z 27012G18KT 10SM BKN045 08/M02 A2992" }],
  model: "claude-haiku-5-5", unavailable: null,
};

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
