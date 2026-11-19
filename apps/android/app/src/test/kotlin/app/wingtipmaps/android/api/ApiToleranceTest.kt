package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.RouteBand
import org.junit.Assert.assertEquals
import org.junit.Test

/** A server that ships before the app: an answer with a field this build
 *  has no property for and an enum value it has never seen still decodes
 *  through the servers' coder (Gateway.json), the new value kept as the
 *  string the server sent (scripts/build/api-models-apps.sh). */
class ApiToleranceTest {
    @Test
    fun anUnknownFieldAndAnUnknownEnumValueDecode() {
        // "hail" is no RouteBand kind of the planner's document (vfr, mvfr,
        // ifr, storm) and "severity" no field of it.
        val band = Gateway.json.decodeFromString<RouteBand>("""{"kind":"hail","min":12.5,"severity":{"level":3}}""")
        assertEquals("hail", band.kind)
        assertEquals(12.5, band.min, 0.0)
    }
}
