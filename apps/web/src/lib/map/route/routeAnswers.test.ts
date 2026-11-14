import { describe, expect, test } from "vitest";
import { noteRouteAnswer, routeAnswersAsked } from "./routeAnswers";

describe("the route's own answers, for Keep for the Air", () => {
  test("the course and the nav log are kept by the address the page asked, the latest of each", () => {
    noteRouteAnswer("https://localhost:8443/api/planner/course?dep=C81&dest=KMSN");
    noteRouteAnswer("https://localhost:8443/api/planner/course?dep=C81&dest=KDLH");
    noteRouteAnswer("https://localhost:8443/api/planner/navlog?dep=C81&dest=KDLH");
    const kept = routeAnswersAsked();
    expect(kept).toContain("/api/planner/course?dep=C81&dest=KDLH");
    expect(kept).not.toContain("/api/planner/course?dep=C81&dest=KMSN");
    expect(kept).toContain("/api/planner/navlog?dep=C81&dest=KDLH");
  });

  test("a map's in-view answers are not the route's", () => {
    noteRouteAnswer("https://localhost:8443/api/planner/airports/in-view?south=1");
    expect(routeAnswersAsked().some((u) => u.includes("in-view"))).toBe(false);
  });
});
