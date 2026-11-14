// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AirplaneFacts } from "./AirplaneFacts";
import type { AircraftRegistration } from "../../lib/api/types";

afterEach(cleanup);

const record = {
  n_number: "N654FL",
  manufacturer: "Piper",
  model: "PA-28-140",
  year: 1971,
  seats: 4,
  engines: 1,
  status: "Valid",
  standing: "valid",
  owner: "Jane Q Pilot",
} as AircraftRegistration;

const fact = (id: string) => screen.queryByTestId(`facts-${id}`)?.textContent ?? null;

describe("an airplane card's facts strip", () => {
  it("says the registry's type, year, seats, engines, registration and owner, each under its name", () => {
    render(<AirplaneFacts record={record} testId="facts" />);
    expect(fact("type")).toBe("TypePiper PA-28-140");
    expect(fact("year")).toBe("Year1971");
    expect(fact("seats")).toBe("Seats4");
    expect(fact("engines")).toBe("Engines1");
    expect(fact("status")).toBe("RegistrationValid");
    expect(fact("owner")).toBe("OwnerJane Q Pilot");
  });

  it("takes the FAA's reference model's seats and engines over the record's", () => {
    render(<AirplaneFacts record={record} model={{ seats: 6, engines: 2 } as never} testId="facts" />);
    expect(fact("seats")).toBe("Seats6");
    expect(fact("engines")).toBe("Engines2");
  });

  it("says an owner withheld from the record is not in it, and a lapsed registration in the destructive ink", () => {
    render(<AirplaneFacts record={{ ...record, owner: null, standing: "lapsed", status: "Expired" }} testId="facts" />);
    expect(fact("owner")).toBe("OwnerNot in the record");
    expect(screen.getByTestId("facts-status").querySelector("dd")?.className).toContain("text-destructive-ink");
  });

  it("falls back to the traffic's type and year with no record, and draws nothing with nothing to say", () => {
    render(<AirplaneFacts record={null} type="A321" year="2019" testId="facts" />);
    expect(fact("type")).toBe("TypeA321");
    expect(fact("year")).toBe("Year2019");
    expect(fact("owner")).toBeNull();
    cleanup();
    render(<AirplaneFacts record={null} testId="facts" />);
    expect(screen.queryByTestId("facts")).toBeNull();
  });
});
