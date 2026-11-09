import type { AircraftChoice } from "./api/types";
import { DEFAULT_AIRCRAFT } from "./preferences";

/**
 * A fixed sample flight, for App Review and for showing the app: Madison
 * (KMSN) to Oshkosh (KOSH), about 60 nautical miles over the Wisconsin
 * sectional, in a stock Cessna 172. Opened from About. The iPhone
 * (apps/ios/Wingtip/DemoFlight.swift) and Android
 * (apps/android/.../about/DemoFlight.kt) fly the same one, so a reviewer
 * sees one flight on all three.
 *
 * Picking it picks the 172 on purpose, so it does not assume an airplane
 * the pilot did not choose (docs/decisions/0011).
 */
export const DEMO_FLIGHT = { dep: "KMSN", dest: "KOSH" } as const;

/** The stock Cessna 172, the planner's own profile (c172). */
export const DEMO_AIRPLANE: AircraftChoice = { ...DEFAULT_AIRCRAFT };

/** Where the planner opens on it: the route, with nothing else of the
 *  pilot's last plan. */
export const DEMO_HREF = `/plan?${new URLSearchParams(DEMO_FLIGHT)}`;
