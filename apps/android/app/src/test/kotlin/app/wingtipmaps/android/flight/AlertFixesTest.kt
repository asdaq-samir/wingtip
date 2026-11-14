package app.wingtipmaps.android.flight

import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.map.MapPick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** An alert tapped opens what it is about and offers its one fix: a
 *  Class B, C or D volume's card; the copilot's alternative flown to, and
 *  the field a message names. */
class AlertFixesTest {
    private fun alert(kind: String, cls: String?) = AheadAlert(
        id = "airspace:C:MADISON", kind = kind, level = "caution", name = "MADISON CLASS C", need = "Two-way radio contact with ATC before entering (91.130(c)(1)).",
        airspaceClass = cls, floorFt = 2500.0, ceilingFt = 4800.0, distanceNm = 8.0, seconds = 240.0, lat = 43.0, lon = -89.3,
    )

    private fun message(id: String, kind: String, alternative: String? = null) = EngineContract.CopilotMessage(
        id = id, kind = kind, level = "caution", title = "t", say = "s", detail = emptyList(), sources = emptyList(), elsewhere = false,
        alternative = alternative?.let {
            EngineContract.CopilotAlternative(ident = it, lat = 43.0, lon = -89.0, distanceNm = 12.0, courseDeg = 270.0, fuel = true, reserveMin = 30.0, private = false, reasons = emptyList())
        },
    )

    @Test
    fun aClassVolumeOpensItsCard() {
        val card = AlertFixes.card(alert("airspace", "c")) as MapPick.Airspace
        assertEquals("C", card.airspaceClass)
        assertEquals(2500.0, card.floorFt, 0.0)
        assertEquals(4800.0, card.ceilingFt!!, 0.0)
        assertEquals(43.0, card.lat, 0.0)
        // No card on this phone for the rest: their rule is the fix.
        assertNull(AlertFixes.card(alert("tfr", null)))
        assertNull(AlertFixes.card(alert("special_use", "MOA")))
        assertNull(AlertFixes.card(alert("terrain", null)))
    }

    @Test
    fun aCopilotMessageFliesToItsAlternativeAndOpensItsField() {
        assertEquals(AlertFixes.CopilotFix(about = "KJVL", flyTo = "KJVL"), AlertFixes.copilot(message("weather:KMSN:IFR", "weather", alternative = "KJVL")))
        assertEquals(AlertFixes.CopilotFix(about = "KMSN", flyTo = null), AlertFixes.copilot(message("weather:KMSN:IFR", "weather")))
        assertEquals(AlertFixes.CopilotFix(about = "KC09", flyTo = "KC09"), AlertFixes.copilot(message("fuel:KMSN", "fuel", alternative = "KC09")))
        assertEquals(AlertFixes.CopilotFix(about = "KMSN", flyTo = null), AlertFixes.copilot(message("night:KMSN", "night")))
        // A destination NASR lists as closed: its card, and Fly To the open
        // field best_fields picked instead (decision 0043).
        assertEquals(AlertFixes.CopilotFix(about = "KC09", flyTo = "KC09"), AlertFixes.copilot(message("closed:00MO", "closed", alternative = "KC09")))
        assertEquals(AlertFixes.CopilotFix(about = "00MO", flyTo = null), AlertFixes.copilot(message("closed:00MO", "closed")))
        // An area or the ground speed names no field.
        assertEquals(AlertFixes.CopilotFix(about = null, flyTo = null), AlertFixes.copilot(message("sua:R-6901", "sua")))
        assertEquals(AlertFixes.CopilotFix(about = null, flyTo = null), AlertFixes.copilot(message("groundspeed:10", "groundspeed")))
    }
}
