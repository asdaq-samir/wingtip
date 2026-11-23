package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config

/**
 * The planner's paths that something other than a generated call reads:
 * MapLibre's tile and image sources, which fill in their own `{z}/{x}/{y}`
 * or fetch a picture by address, and the bytes of a pack or a picture the
 * generated PlannerApi answers only as Response<Unit>. Each is the
 * generated operation's own path (named beside it), which PlannerPathsTest
 * holds the same, so a path the planner's document moves fails a test
 * rather than the map; written in the planner's `/api/…` form, which
 * Planner.url and `address` put behind the gateway's proxy.
 */
object PlannerPaths {
    /** PlannerApi.terrainTile, with MapLibre's placeholders. */
    const val TERRAIN_TILES = "/api/terrain-tile/{z}/{x}/{y}.png"

    /** PlannerApi.chartTile (`density` "") and chartTile2x ("@2x"). */
    fun chartTile(kind: String, z: String, x: String, y: String, density: String): String = "/api/chart-tile/$kind/$z/$x/$y$density.png"

    /** PlannerApi.cyclePackFile. */
    fun cyclePack(cycle: String, region: String): String = "/api/cycle-pack/$cycle/$region.pack"

    /** PlannerApi.flowPicture. */
    fun flowPicture(frame: String, field: String): String = "/api/weather/flow/$frame/$field.png"

    /** PlannerApi.approachPlatePage where the page is placed, else approachPlate. */
    fun plate(page: Boolean, cycle: String, ident: String, procedure: String): String =
        "/api/${if (page) "approach-plate-page" else "approach-plate"}/$cycle/$ident/$procedure.png"

    /** A planner path as a whole address through the gateway's proxy, kept
     *  as written: a tile template's braces are MapLibre's to fill, which
     *  Planner.url's HttpUrl would escape. */
    fun address(path: String): String = Config.gateway + Config.plannerPath(path)
}
