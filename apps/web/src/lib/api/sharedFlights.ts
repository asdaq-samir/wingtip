import { data, gateway } from "./client";
import type { FlightShare, SharedFlight } from "./types";

/** A saved flight's share, by its own pilot (FlightShareController). */
export const flightShares = {
  /** Shares it, or changes whether its N-number goes with it; the same
   *  link either way. */
  share: (id: number, includeTail: boolean) =>
    gateway.POST("/api/flights/{id}/share", { params: { path: { id } }, body: { includeTail } }).then(data<FlightShare>),
  /** Stops sharing it: its link answers no more, for anyone. */
  stop: (id: number): Promise<void> => gateway.DELETE("/api/flights/{id}/share", { params: { path: { id } } }).then(() => undefined),
};

/** A flight shared with whoever has its link, read signed in or not. */
export const sharedFlights = {
  get: (token: string) => gateway.GET("/api/shared-flights/{token}", { params: { path: { token } } }).then(data<SharedFlight>),
};
