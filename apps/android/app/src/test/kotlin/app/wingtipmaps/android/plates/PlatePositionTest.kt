package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Own ship on a plate full screen: the planner's georeference handed to
 *  the engine's plate_page_point as the shared fixture (KRFD ILS RWY 07,
 *  apps/web/src/lib/fixtures/platePagePoint.json) gives it, and nothing
 *  asked with no fix or no georeference. */
class PlatePositionTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val fixture = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("platePagePoint.json")).readText(),
    ).jsonObject.getValue("georeference")

    @Test
    fun thePlannersGeoreferenceIsTheEnginesInput() {
        val planner = json.decodeFromJsonElement<PlateGeoreference>(fixture)
        val engine = json.decodeFromJsonElement<EngineContract.PlatePagePointInputGeoreference>(fixture)
        assertEquals(engine, PlatePosition.asked(planner))
    }

    @Test
    fun noFixOrNoGeoreferenceDrawsNothing() {
        val planner = json.decodeFromJsonElement<PlateGeoreference>(fixture)
        assertNull(PlatePosition.of(null, planner).getOrThrow())
        val fix = OwnShip.Fix(42.2, -89.1, 2000.0, 70.0, 90.0, 5.0, 0L)
        assertNull(PlatePosition.of(fix, null).getOrThrow())
    }
}
