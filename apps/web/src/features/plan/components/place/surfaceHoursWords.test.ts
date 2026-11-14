import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/surfaceHours.json";
import { airspaceWords } from "./factWords";
import { changeNote, normalHours, todayWords, type SurfaceHours } from "./surfaceHoursWords";

// The engine's answers in the shared cases (surface_hours), as the card writes them.
const answer = (about: string) => fixture.cases.find((c) => c.about.startsWith(about))!.answer as SurfaceHours;
const d = { class: "D" as const, part_time: true, otherwise: "E" as const, otherwise_part_time: true };
const g = { ...d, otherwise: "G" as const, otherwise_part_time: false };

describe("the Airspace fact's note", () => {
  it("says the day's next change at the field's own clock", () => {
    // KPWK on a Saturday: D at noon, E after 22:00; E at 23:00, D from 07:00.
    expect(airspaceWords(d, answer("KPWK on a Saturday at noon"))).toEqual({ value: "D", note: "E after 22:00" });
    expect(airspaceWords(d, answer("KPWK on a Saturday at 23:00"))).toEqual({ value: "E", note: "D from 07:00" });
    expect(changeNote(g, answer("KOSH's seasons"))).toBe("G after 22:00");
  });
  it("is part-time alone where the hours cannot be known", () => {
    expect(airspaceWords(g, answer("Closed on holidays"))).toEqual({ value: "D", note: "Part-time" });
    expect(changeNote(g, null)).toBe("Part-time");
    expect(changeNote({ ...g, part_time: false }, null)).toBeNull();
  });
});

describe("the Airspace hours", () => {
  it("writes today's times as the class and what follows", () => {
    expect(todayWords(answer("KPWK on a Saturday at noon"))).toBe("07:00–22:00, then E");
    expect(todayWords(answer("Closed on holidays"))).toBeNull();
  });
  it("lists the week Monday first, days alike grouped, today marked", () => {
    expect(normalHours(answer("KPWK on a Saturday at noon"))).toEqual([
      { days: "Mon – Fri", times: "06:00–22:00", today: false },
      { days: "Sat – Sun", times: "07:00–22:00", today: true },
    ]);
  });
});
