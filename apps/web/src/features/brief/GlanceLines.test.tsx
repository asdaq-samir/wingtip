// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Accordion } from "../../components/ui/accordion";
import { Line } from "./GlanceLines";

afterEach(cleanup);

test("a route into Canada is one caution line among the Brief's findings", () => {
  // C81 to Thunder Bay, as the engine words it (route_jurisdiction, asked
  // by the planner with the course: app.route_borders).
  const brief = {
    lead: "Part of the route is in Canada (Ontario): Canadian rules not checked — figures use US rules",
    line: "Part of the route is in Canada (Ontario): Canadian rules not checked — figures use US rules",
    action: "Check Canada's rules",
    why: "US rules",
    cite: "14 CFR 91.703(a)",
  };
  render(
    <Accordion>
      <Line line={{ ...brief, key: "jurisdiction", finding: "caution", tab: "enroute", section: null, raw: [] }} onOpen={() => {}} />
    </Accordion>,
  );
  expect(screen.getByTestId("brief-line-jurisdiction").getAttribute("data-finding")).toBe("caution");
  expect(screen.getByTestId("brief-line-words").textContent).toBe(
    "Part of the route is in Canada (Ontario): Canadian rules not checked — figures use US rules",
  );
});
