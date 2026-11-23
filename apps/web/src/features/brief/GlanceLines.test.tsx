// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Accordion } from "../../components/ui/accordion";
import { callEngine } from "../../lib/engine/engine";
import { Line } from "./GlanceLines";

afterEach(cleanup);

test("a route into Canada is one caution line among the Brief's findings", () => {
  // C81 to Thunder Bay, as the engine words it (route_jurisdiction).
  const { brief } = callEngine("route_jurisdiction", {
    points: [
      { lat: 42.3246, lon: -88.0741 },
      { lat: 48.3719, lon: -89.3239 },
    ],
  });
  render(
    <Accordion>
      <Line line={{ ...brief!, key: "jurisdiction", finding: "caution", tab: "enroute", section: null, raw: [] }} onOpen={() => {}} />
    </Accordion>,
  );
  expect(screen.getByTestId("brief-line-jurisdiction").getAttribute("data-finding")).toBe("caution");
  expect(screen.getByTestId("brief-line-words").textContent).toBe(
    "Part of the route is in Canada (Ontario): Canadian rules not checked — figures use US rules",
  );
});
