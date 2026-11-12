import { parseAsString, useQueryStates } from "nuqs";
import { addressParsers } from "../../lib/address";

/**
 * The Studio's own keys of the address, beside the planner's (lib/address):
 * the airplane loaded, by N-number or ICAO address (`q`), and its UTC day
 * (`day`); the crash draft open (`draft`); and `render=1`, the render
 * script's ask to film the open draft (scripts/dev/studio-render.mjs).
 */
const studioParsers = { ...addressParsers, q: parseAsString, day: parseAsString, draft: parseAsString, render: parseAsString };

/** The Studio's address and its setter, through nuqs as the planner's is. */
export const useStudioAddress = () => useQueryStates(studioParsers);
