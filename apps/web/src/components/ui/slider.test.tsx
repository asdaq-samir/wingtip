// @vitest-environment jsdom
/**
 * The stock Slider draws one thumb for one value, given as a number or as
 * an array, and two for a range: the Profile card's altitude (a number)
 * drew two role=slider inputs once, both named "Cruise altitude".
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Slider } from "./slider";

afterEach(cleanup);

const cases: [string, { value?: number | number[]; defaultValue?: number | number[] }, number][] = [
  ["a number", { value: 3 }, 1],
  ["an array of one", { value: [3] }, 1],
  ["a default number", { defaultValue: 3 }, 1],
  ["a range", { value: [2, 6] }, 2],
];

test.each(cases)("%s draws its thumbs", (_name, props, thumbs) => {
  render(<Slider min={0} max={10} thumb={{ "aria-label": "Cruise altitude" }} {...props} />);
  // Each thumb's input, the element that is the slider, by its name: Base
  // UI keeps a thumb out of sight until it has measured the track, which
  // jsdom never lays out, so not by its role, which counts only what shows.
  expect(screen.getAllByLabelText("Cruise altitude")).toHaveLength(thumbs);
});
