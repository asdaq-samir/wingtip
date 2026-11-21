import { describe, expect, test } from "vitest";
import type { Briefing } from "../../lib/api/types";
import { adverseRows } from "./adverse";

const during = (source: string, from_nm: number) => ({
  legs: [0, 1],
  from_nm,
  to_nm: from_nm + 20,
  enter: "2026-11-21T14:40:00Z",
  leave: "2026-11-21T15:00:00Z",
  valid_from: "2026-11-21T12:00:00Z",
  valid_to: "2026-11-21T18:00:00Z",
  when: "during" as const,
  source,
});

const briefing = (parts: Partial<Briefing>) =>
  ({ hazards: [], gairmets: [], tfrs: [], pireps: [], weather_unavailable: [], ...parts }) as unknown as Briefing;

describe("the Brief's Adverse Conditions (the engine's gonogo_adverse_rows)", () => {
  test("none with no briefing or nothing on the route", () => {
    expect(adverseRows(null)).toEqual({ rows: [], more: 0 });
    expect(adverseRows(briefing({}))).toEqual({ rows: [], more: 0 });
  });

  test("a TFR crossed first, then the convective SIGMET, then the G-AIRMET, at most three", () => {
    const answer = adverseRows(
      briefing({
        gairmets: [
          { hazard: "IFR", on_route: during("G-AIRMET", 10) },
          { hazard: "Mountain obscuration", on_route: during("G-AIRMET", 60) },
        ],
        hazards: [{ hazard: "CONVECTIVE", type: "SIGMET", on_route: during("Convective SIGMET", 40) }],
        tfrs: [{ notam_id: "6/4116", title: "Madison", crosses: true, along_track_nm: 80, active_now: false, on_route: during("TFR", 80) }],
      } as unknown as Partial<Briefing>),
    );
    expect(answer.rows.map((r) => r.source)).toEqual(["TFR", "Convective SIGMET", "G-AIRMET"]);
    expect(answer.more).toBe(1);
    expect(answer.rows[0]).toMatchObject({ title: "TFR 6/4116 Madison", finding: "stop", tab: "preflight", time_kind: "at" });
    expect(answer.rows[2]).toMatchObject({ finding: "caution", section: "Adverse Conditions", time_kind: "until" });
  });

  test("a TFR only near the route and a routine pilot report are left to their pages", () => {
    const answer = adverseRows(
      briefing({
        tfrs: [{ notam_id: "6/1", crosses: false, along_track_nm: 3, active_now: true, on_route: null }],
        pireps: [{ urgent: false, along_track_nm: 4, turbulence: "LGT", on_route: null }],
      } as unknown as Partial<Briefing>),
    );
    expect(answer.rows).toEqual([]);
  });
});
