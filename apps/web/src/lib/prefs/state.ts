import type { AirplaneSlice } from "./airplaneTypes";
import type { AlertsSlice } from "./alertsTypes";
import type { KeptSlice } from "./keptTypes";
import type { LookSlice } from "./lookTypes";
import type { MapSlice } from "./mapTypes";

/**
 * Everything remembered per browser, in one zustand store persisted to
 * localStorage by its own middleware under one key, made of zustand's stock
 * slices, one file each (lib/prefs): what the map draws (mapSlice), the
 * app's look (lookSlice), the airplane and the pilot's limits
 * (airplaneSlice), the places and airplanes kept (keptSlice) and what is
 * said in the air (alertsSlice). It was one 614-line store changed by
 * every feature. Components read a part with
 * the hook (`usePreferences(s => s.base)`); code outside React -- the
 * map's chart layers -- reads `getState()` and `subscribe()`.
 *
 * localStorage is a convenience only: unavailable (a private window,
 * blocked site data) the store simply starts from its defaults each
 * visit, which the middleware handles on its own.
 *
 * Declared here, beside the slices' types and not in the store's file, so a
 * slice can be typed on it (Slice) without importing the store that imports
 * the slice.
 */
export interface Preferences extends MapSlice, LookSlice, AirplaneSlice, KeptSlice, AlertsSlice {}
