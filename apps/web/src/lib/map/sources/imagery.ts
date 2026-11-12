/** The USGS's aerial imagery of the United States (The National Map's
 *  USGSImageryOnly, a public-domain work: NAIP's 0.6 to 1 m aerial
 *  photographs over the lower 48, partners' imagery over Alaska, Hawaii,
 *  Puerto Rico and the territories), a tile cache on CloudFront that any
 *  page may fetch (Access-Control-Allow-Origin: *, checked 2026-11-12):
 *  z/y/x, as the Map menu's picture of it is cut from (MapSettings). */
export const USGS_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";

/** Its last level of tiles: the service's maxScale, 1:9,028, is {z} 16
 *  (about 2 m a pixel at 40 degrees north); MapLibre enlarges it past. */
export const USGS_MAX_ZOOM = 16;

/** Its credit. The USGS asks, not requires, that its public-domain data be
 *  acknowledged (usgs.gov FAQ "Are USGS reports/publications
 *  copyrighted?", read 2026-11-12); the service names its sources as
 *  "USDA, USGS The National Map: Orthoimagery". */
export const USGS_CREDIT = "Imagery USGS The National Map";

/** The level at which the imagery's own cover is asked about
 *  (useImageryCovers): the cache has Landsat's 30 m pictures of Canada and
 *  Mexico to {z} 12, and from 13 only the aerial imagery, of the United
 *  States and a fringe across its borders; the Bahamas and the open sea
 *  have none at any level (each a 404, checked 2026-11-12). */
export const USGS_COVER_ZOOM = 13;
