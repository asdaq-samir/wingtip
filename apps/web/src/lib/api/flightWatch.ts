import { gateway, data } from "./http";
import { ApiError } from "./errors";
import type { FlightWatch } from "./types";

/** The flight watch on the gateway (FlightWatchController), through its
 *  generated client: started, read and stopped. */
export const flightWatch = {
  /** Started, or its departure moved: the same POST either way. */
  start: (flightId: number, departAt: string) =>
    gateway.POST("/api/flights/{id}/watch", { params: { path: { id: flightId } }, body: { departAt } }).then(data<FlightWatch>),
  /** The watch as it stands, or null where there is none (a 404). */
  get: (flightId: number, signal?: AbortSignal): Promise<FlightWatch | null> =>
    gateway
      .GET("/api/flights/{id}/watch", { params: { path: { id: flightId } }, signal })
      .then(data<FlightWatch>)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
  stop: (flightId: number): Promise<void> =>
    gateway.DELETE("/api/flights/{id}/watch", { params: { path: { id: flightId } } }).then(() => undefined),
};
