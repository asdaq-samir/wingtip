import { queryOptions } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AircraftRegistration, PastFlightSummary } from "../api/types";

/** A field as a past flight names its ends. */
type PastFlightField = NonNullable<PastFlightSummary["origin"]>;

// TODO(claude/plane-data): these are the planner's AirplaneDetails and AirplanePhoto
// (services/planner/app/schemas/airplane.py on claude/plane-data), written out here until that
// branch's openapi.json is merged; then `Schemas["AirplaneDetails"]` etc. from lib/api/types and
// the two fetches below `planner.GET("/api/airplanes/{n_number}")` in lib/api/plannerMap.

/** The FAA's reference record of the make and model (ACFTREF). */
interface AircraftModel {
  code: string;
  manufacturer?: string | null;
  model?: string | null;
  aircraft_type?: string | null;
  engine_type?: string | null;
  category?: string | null;
  builder_certification?: string | null;
  engines?: number | null;
  seats?: number | null;
  weight_class?: string | null;
  tc_data_sheet?: string | null;
  tc_holder?: string | null;
}

/** The FAA's reference record of the engine (ENGINE). */
interface EngineModel {
  code: string;
  manufacturer?: string | null;
  model?: string | null;
  engine_type?: string | null;
  horsepower?: number | null;
  thrust_lb?: number | null;
}

/** A canceled registration (DEREG): this airframe's, or another that had the N-number. */
interface PastRegistration {
  n_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  year?: number | null;
  owner?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  cancel_date?: string | null;
  export_country?: string | null;
  same_airframe?: boolean;
}

/** An NTSB accident or incident, with its CAROL report. */
interface NtsbCase {
  ntsb_no?: string | null;
  ev_id: string;
  date?: string | null;
  city?: string | null;
  state?: string | null;
  kind?: string | null;
  highest_injury?: string | null;
  damage?: string | null;
  phase?: string | null;
  carol_url: string;
}

/** Where it is usually based (the engine's usual_base over its flights). */
interface UsualBase {
  field?: PastFlightField | null;
  count: number;
  ends: number;
}

export interface AirplaneDetails {
  n_number: string;
  registration?: (AircraftRegistration & { co_owner_names?: string[]; last_action?: string | null; mode_s_octal?: string | null }) | null;
  model?: AircraftModel | null;
  engine?: EngineModel | null;
  past_registrations?: PastRegistration[];
  ntsb?: NtsbCase[];
  based?: UsualBase | null;
  based_pending?: boolean;
  sources?: { name: string; credit: string }[];
}

/** The newest Planespotters.net photo of this very airplane, on its terms. */
export interface AirplanePhoto {
  thumbnail?: string | null;
  thumbnail_large?: string | null;
  width?: number | null;
  height?: number | null;
  photographer?: string | null;
  link: string;
  source?: string;
}

/** Everything public about the airplane, asked again while where it is based is looked up. */
export const airplaneDetailsQuery = (tail: string) =>
  queryOptions({
    queryKey: ["airplane-details", tail],
    queryFn: () => api.airplaneDetails(tail),
    staleTime: 60 * 60_000,
    refetchInterval: (query) => (query.state.data?.based_pending && query.state.dataUpdateCount <= 5 ? 5_000 : false),
    meta: { silent: true },
  });

/** Its photo, apart, so the record never waits on Planespotters.net. */
export const airplanePhotoQuery = (tail: string) =>
  queryOptions({
    queryKey: ["airplane-photo", tail],
    queryFn: () => api.airplanePhoto(tail),
    staleTime: 24 * 60 * 60_000,
    meta: { silent: true },
  });
