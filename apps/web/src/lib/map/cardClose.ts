import { createContext } from "react";

/**
 * How a card from the map puts itself away before it acts -- a station's
 * Direct To, a waypoint's Add to Route (PointActions): the map's sheet
 * card closed (GlMapShell).
 * Nothing where no map gave one.
 */
export const CardCloseContext = createContext<() => void>(() => {});
