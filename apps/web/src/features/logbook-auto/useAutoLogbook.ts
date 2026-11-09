import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import type { LogbookEntry } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { useOwnShip } from "../../lib/map/ownShip";
import { airplaneChosen, usePreferences } from "../../lib/preferences";
import { flightsQuery, pilotQuery } from "../../lib/queryClient";
import { entryRequest, flightEnded, likelyFlight, type Edits } from "./draftEntry";
import { asked, forget, record, recorded } from "./recorder";

/** The engine read the track in the browser at most this often while it
 *  records: whether the flight has ended is a question of minutes. */
const LOOK_EVERY_POINTS = 12;

/**
 * The flight logged with no typing -- "Flight logged"'s view model. While
 * own ship is on (its GPS, not a dry run) the flight is recorded on this
 * device (recorder). When the engine, reading it here, finds the
 * airplane has landed and come to rest (logbook_from_track's block), the
 * planner draws the entry with the fields and approaches round the track
 * (POST /api/logbook-draft), and the pilot reviews it, changes what they
 * like and logs it (POST /api/logbook) -- never saved unasked. Logged,
 * the currency is asked again (it is the engine's, from the logbook), and
 * the track goes to the saved flight it was flown as, for its debrief, as
 * well as to the approaches' debrief here.
 */
export function useAutoLogbook() {
  const queryClient = useQueryClient();
  const ready = useEngineReady();
  const recording = useOwnShip(s => s.enabled && !s.simulated && s.fix !== null);
  const points = recorded(s => s.value.points);
  const askedTo = recorded(s => s.value.askedTo);
  const aircraft = usePreferences(p => p.aircraft);
  const { data: pilot } = useQuery(pilotQuery);
  const [problem, setProblem] = useState<string | null>(null);

  // Each fix into the track, as own ship gets it (its GPS, not a dry run).
  useEffect(() => useOwnShip.subscribe((s, before) => {
    if (!s.enabled || s.simulated || !s.fix || s.fix === before.fix) return;
    if (!record(s.fix)) setProblem("This browser would not keep the flight's track, so it cannot be logged from it.");
  }), []);

  // The engine's own reading of the track, looked at once a minute of
  // points: has a flight landed and come to rest?
  const looked = Math.floor(points.length / LOOK_EVERY_POINTS);
  const seen = useMemo(() => recorded.getState().value.points.slice(0, looked * LOOK_EVERY_POINTS), [looked]);
  const local = useMemo(() => {
    if (!ready || seen.length < 2) return null;
    try {
      return callEngine("logbook_from_track", { points: seen });
    } catch {
      return null;
    }
  }, [ready, seen]);
  const endedAt = flightEnded(local, seen, askedTo);
  // Open while a flight has ended and not been let go: Later marks it
  // asked, Not a Flight forgets the track, Log forgets it once logged.
  const open = endedAt !== null;

  const ask = {
    points,
    aircraft: airplaneChosen(aircraft) ? (aircraft.tail ?? null) : null,
    aircraftType: airplaneChosen(aircraft) ? aircraft.profile.toUpperCase() : null,
    // The pilot's clock, for the day the flight is logged on.
    utcOffsetMin: -new Date().getTimezoneOffset(),
    picked: null,
  };
  const draft = useQuery({
    // Asked once for the flight that ended, not again as points come in.
    queryKey: ["logbook-draft", endedAt],
    queryFn: ({ signal }) => api.logbookDraft(ask, signal),
    enabled: open && !!pilot && points.length >= 2,
    staleTime: Infinity,
    meta: { silent: true },
  });
  const flights = useQuery({ ...flightsQuery, enabled: open && !!pilot });

  const [edits, setEdits] = useState<Edits>({});
  const [byInstruments, setByInstruments] = useState(false);
  const route = draft.data?.entry.route ?? "";
  const likely = useMemo(() => likelyFlight(flights.data ?? [], route), [flights.data, route]);
  const [flightId, setFlightId] = useState<number | null | undefined>(undefined);
  const linked = flightId === undefined ? (likely?.id ?? null) : flightId;
  const [logged, setLogged] = useState<{ entry: LogbookEntry; points: typeof points; fields: string[] } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.data) throw new Error("No draft to log.");
      const entry = await api.logbook.add(entryRequest(draft.data, edits, byInstruments, linked));
      // The flight's debrief reads its track from the account.
      if (entry.flightId) {
        await api.flights.saveTrack(entry.flightId, {
          source: "Recorded by Wingtip",
          points: points.map(p => ({ t: p.t, lat: p.lat, lon: p.lon, altFt: p.alt_ft })),
        });
      }
      return entry;
    },
    onSuccess: entry => {
      const fields = [...new Set((draft.data?.approaches ?? []).map(a => a.airport))];
      setLogged({ entry, points, fields });
      forget();
      setEdits({});
      setByInstruments(false);
      setFlightId(undefined);
      // The logbook and what it says of the pilot (the engine's currency).
      for (const key of ["logbook", "currency", "paperwork", "training"]) void queryClient.invalidateQueries({ queryKey: [key] });
      if (entry.flightId) void queryClient.invalidateQueries({ queryKey: ["flight-track", entry.flightId] });
    },
  });

  return {
    open: open || logged !== null,
    signedIn: !!pilot,
    recording,
    problem,
    draft: draft.data ?? null,
    pending: draft.isPending && draft.fetchStatus !== "idle",
    draftError: draft.error,
    retry: () => void draft.refetch(),
    edits,
    edit: (patch: Edits) => setEdits(e => ({ ...e, ...patch })),
    byInstruments,
    setByInstruments,
    flights: flights.data ?? [],
    linked,
    link: (id: number | null) => setFlightId(id),
    log: () => save.mutate(),
    logging: save.isPending,
    logError: save.error,
    logged,
    /** Not now: kept recording, and not offered again until a later landing. */
    later: () => {
      if (endedAt !== null) asked(endedAt);
    },
    /** Not a flight to log: the track let go. */
    discard: () => {
      forget();
    },
    close: () => {
      setLogged(null);
    },
  };
}

export type AutoLogbook = ReturnType<typeof useAutoLogbook>;
