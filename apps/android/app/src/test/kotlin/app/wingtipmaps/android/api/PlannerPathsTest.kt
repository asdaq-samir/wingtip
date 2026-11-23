package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.client.apis.PlannerApi
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.http.GET

/** The planner's addresses read by MapLibre or kept as bytes
 *  (PlannerPaths) are the generated PlannerApi's own paths, so a path the
 *  planner's OpenAPI document moves is caught here with the regenerated
 *  client, rather than by a map with no tiles. */
class PlannerPathsTest {
    /** The generated operation's path in the planner's `/api/…` form, its
     *  `{name}`s filled from `values` in order. */
    private fun generated(name: String, vararg values: String): String {
        val path = checkNotNull(PlannerApi::class.java.methods.first { it.name == name }.getAnnotation(GET::class.java)).value
        var i = 0
        return "/api/" + Regex("\\{[^}]+\\}").replace(path) { m -> values.getOrElse(i++) { m.value } }
    }

    @Test
    fun eachPathIsTheGeneratedOperations() {
        assertEquals(generated("terrainTile"), PlannerPaths.TERRAIN_TILES)
        assertEquals(generated("chartTile", "sec", "9", "130", "190"), PlannerPaths.chartTile("sec", "9", "130", "190", ""))
        assertEquals(generated("chartTile2x", "sec", "9", "130", "190"), PlannerPaths.chartTile("sec", "9", "130", "190", "@2x"))
        assertEquals(generated("cyclePackFile", "2601", "n40w090"), PlannerPaths.cyclePack("2601", "n40w090"))
        assertEquals(generated("flowPicture", "f1", "wind-060"), PlannerPaths.flowPicture("f1", "wind-060"))
        assertEquals(generated("approachPlate", "2601", "KMSN", "ILS 18"), PlannerPaths.plate(false, "2601", "KMSN", "ILS 18"))
        assertEquals(generated("approachPlatePage", "2601", "KMSN", "ILS 18"), PlannerPaths.plate(true, "2601", "KMSN", "ILS 18"))
    }
}
