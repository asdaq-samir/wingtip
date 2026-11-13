// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/client";
import type { Pilot } from "./api/types";
import { useHomeAirportSync } from "./homeAirport";
import { forgetPilot, usePreferences } from "./preferences";
import { useSystemProblems } from "./problems";
import { pilotQuery, queryClient } from "./queryClient";

const KMSN = { ident: "KMSN", name: "Dane County Regional", municipality: "Madison", lat: 43.14, lon: -89.34 };
const C81 = { ident: "C81", name: "Campbell", municipality: "Grayslake", lat: 42.32, lon: -88.07 };
const pilot = (homeBase: string | null) => ({ id: 1, email: "p@example.com", phone: "608-555-0100", homeBase }) as unknown as Pilot;

function setUp(signedIn: Pilot | null) {
  queryClient.setQueryData(pilotQuery.queryKey, signedIn);
  vi.spyOn(api, "me").mockResolvedValue(signedIn);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useHomeAirportSync(), { wrapper });
}

beforeEach(() => {
  forgetPilot();
  vi.spyOn(api, "airport").mockImplementation(async (ident: string) => ({ ...(ident === "KMSN" ? KMSN : C81) }) as never);
});

afterEach(() => {
  queryClient.clear();
  useSystemProblems.setState({ problems: [] });
  vi.restoreAllMocks();
});

describe("the home airport, one field with the account's home base", () => {
  it("brings the account's home base to this device when signed in", async () => {
    usePreferences.getState().setHomeAirport(C81);
    const contact = vi.spyOn(api, "setContact");
    setUp(pilot("KMSN"));
    await waitFor(() => expect(usePreferences.getState().homeAirport?.ident).toBe("KMSN"));
    // Brought here, not written back.
    expect(contact).not.toHaveBeenCalled();
  });

  it("writes a home picked here to the account, the phone number sent back as it was", async () => {
    const contact = vi.spyOn(api, "setContact").mockResolvedValue(pilot("C81"));
    setUp(pilot(null));
    act(() => usePreferences.getState().setHomeAirport(C81));
    await waitFor(() => expect(contact).toHaveBeenCalledWith({ phone: "608-555-0100", homeBase: "C81" }));
    await waitFor(() => expect(queryClient.getQueryData(pilotQuery.queryKey)?.homeBase).toBe("C81"));
  });

  it("clears the account's home base when the home is removed here", async () => {
    usePreferences.getState().setHomeAirport(KMSN);
    const contact = vi.spyOn(api, "setContact").mockResolvedValue(pilot(null));
    setUp(pilot("KMSN"));
    act(() => usePreferences.getState().setHomeAirport(null));
    await waitFor(() => expect(contact).toHaveBeenCalledWith({ phone: "608-555-0100", homeBase: "" }));
  });

  it("keeps the device's own home when the account has none, and writes nothing signed out", async () => {
    usePreferences.getState().setHomeAirport(C81);
    const contact = vi.spyOn(api, "setContact");
    setUp(null);
    act(() => usePreferences.getState().setHomeAirport(KMSN));
    expect(usePreferences.getState().homeAirport?.ident).toBe("KMSN");
    expect(contact).not.toHaveBeenCalled();
  });

  it("says where it happens when the account could not be written", async () => {
    vi.spyOn(api, "setContact").mockRejectedValue(new Error("offline"));
    setUp(pilot(null));
    act(() => usePreferences.getState().setHomeAirport(C81));
    await waitFor(() => expect(useSystemProblems.getState().problems.map((p) => p.id)).toContain("home-airport"));
    // The device keeps the pick.
    expect(usePreferences.getState().homeAirport?.ident).toBe("C81");
  });
});
