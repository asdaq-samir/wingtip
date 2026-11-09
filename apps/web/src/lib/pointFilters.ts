/** The training map's point filters (the walk's DR and visual roles, where a
 *  point came from, rated or not): which ones show, kept per browser by
 *  lib/preferences and applied by chart-labels' isVisible. Here rather than
 *  in chart-labels so the preferences store, which is lib, need not reach
 *  into a feature. */
export const FILTER_KEYS = [
  "dr", "visual", "detected", "added", "rated", "unrated",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Record<FilterKey, boolean>;

export const DEFAULT_FILTERS: Filters = {
  dr: true, visual: false,
  detected: true, added: true,
  rated: true, unrated: true,
};
