import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api/client";
import type { Pilot } from "./api/types";
import { clearProblem, raiseProblem } from "./problems";
import { usePreferences, type RecentAirport } from "./preferences";
import { airportQuery, pilotQuery, queryClient } from "./queryClient";

/*
 * The pilot's home airport, one field on all three apps. Signed in, the
 * account's home base (the gateway's pilots.home_base, PUT /api/me/contact)
 * is the source of truth, as on the iPhone and Android: what the account
 * says is brought to this device, and a home picked or cleared here is
 * written to the account, so the home field follows the pilot to the
 * phones. The device's own copy (preferences' homeAirport) is what the
 * search, Fly Here and the first flight read, and all a signed-out pilot
 * has; signing out forgets it (forgetPilot), as the phones do. An account
 * with no home base leaves the device's copy as it is.
 */

const PROBLEM = "home-airport";

/** The kept copy of a field from its lookup, as the search keeps one. */
async function lookUp(ident: string): Promise<RecentAirport | null> {
  try {
    const a = await queryClient.fetchQuery(airportQuery(ident));
    return { ident: a.ident, name: a.name, municipality: a.municipality, lat: a.lat, lon: a.lon };
  } catch {
    return null;
  }
}

/** The home field written to the account, the telephone number sent back
 *  as it is (the request carries both); the answer kept as the pilot. */
async function save(pilot: Pilot, ident: string | null) {
  clearProblem(PROBLEM);
  try {
    const next = await api.setContact({ phone: pilot.phone ?? "", homeBase: ident ?? "" });
    queryClient.setQueryData(pilotQuery.queryKey, next);
  } catch {
    raiseProblem({
      id: PROBLEM,
      title: "Couldn't save your home airport to your account",
      retry: () => {
        const now = queryClient.getQueryData(pilotQuery.queryKey);
        if (now) void save(now, usePreferences.getState().homeAirport?.ident ?? null);
      },
    });
  }
}

/** Keeps the device's home airport and the account's home base one field
 *  while a pilot is signed in (MapPage mounts it once). */
export function useHomeAirportSync() {
  const { data: pilot } = useQuery(pilotQuery);
  const accountHome = pilot?.homeBase ?? null;

  // The account's home brought to this device when it differs.
  useEffect(() => {
    if (!accountHome || usePreferences.getState().homeAirport?.ident === accountHome) return;
    let live = true;
    void lookUp(accountHome).then((airport) => {
      if (live && airport && usePreferences.getState().homeAirport?.ident !== airport.ident)
        usePreferences.getState().setHomeAirport(airport);
    });
    return () => {
      live = false;
    };
  }, [accountHome]);

  // A home picked or cleared on this device written to the account. The
  // account's own, just brought here, matches and is not written back.
  useEffect(() => {
    if (!pilot) return;
    return usePreferences.subscribe((s, before) => {
      if (s.homeAirport?.ident === before.homeAirport?.ident) return;
      const ident = s.homeAirport?.ident ?? null;
      const now = queryClient.getQueryData(pilotQuery.queryKey);
      if (!now || ident === (now.homeBase ?? null)) return;
      void save(now, ident);
    });
  }, [pilot]);
}
