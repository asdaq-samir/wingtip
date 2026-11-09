package app.wingtipmaps.android.brief

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.generated.DepartureWindow
import app.wingtipmaps.android.api.generated.DepartureWindowAsk
import app.wingtipmaps.android.api.generated.VerdictItem
import app.wingtipmaps.android.api.generated.Window
import app.wingtipmaps.android.api.generated.WindowHour
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** "When should I go?": asked as the web asks it, kept for a route, and
 *  its hours written as the web's hourWords write them. */
class DepartureWindowTest {
    @get:Rule val main = MainRule()

    private val chicago = ZoneId.of("America/Chicago")
    private fun hour(at: String, verdict: String, ete: Double? = 58.0, fuel: Double? = 11.6) = WindowHour(
        depart = at, eteMin = ete, fuelGal = fuel, night = false, nightPassengers = false, verdict = verdict,
        reasons = listOf(VerdictItem(detail = "Ceiling 800 ft at KMSN", finding = "stop", key = "weather", label = "Weather", tab = "weather")),
    )

    @Test
    fun askedOnceForARouteAndNoAirplaneSaidSo() {
        val asks = mutableListOf<DepartureWindowAsk>()
        val model = DepartureWindowModel({ asks += it; DepartureWindow(airplane = false, hours = listOf(hour("2026-11-09T13:00:00Z", "go")), windows = emptyList()) }, now = { 0L })
        val plan = Plan.State(dep = "KDPA", dest = "KMSN")
        model.ask(plan, signedIn = false)
        assertEquals(0, asks.size)
        model.ask(plan, signedIn = true)
        model.ask(plan, signedIn = true)
        assertEquals(1, asks.size)
        assertEquals("none", asks[0].aircraft)
        assertEquals(false, asks[0].airplane)
        assertEquals("ETE and fuel need an airplane", HourWords.hourFigures(model.state.value.answer!!.hours[0], model.state.value.airplane))
        model.pick("2026-11-09T13:00:00Z")
        assertEquals("2026-11-09T13:00:00Z", model.state.value.picked)
        model.pick("2026-11-09T13:00:00Z")
        assertNull(model.state.value.picked)
    }

    @Test
    fun hoursInTheWebsWords() {
        val now = Instant.parse("2026-11-09T12:00:00Z")
        assertEquals("Best: 07:00–10:00 CST", HourWords.bestLine(Window(hours = 4, start = "2026-11-09T13:00:00Z", last = "2026-11-09T16:00:00Z", quickest = "x"), now, chicago))
        assertEquals("Best: Tue 07:00 CST", HourWords.bestLine(Window(hours = 1, start = "2026-11-10T13:00:00Z", last = "2026-11-10T13:00:00Z", quickest = "x"), now, chicago))
        assertEquals("ETE 58m · 11.6 gal", HourWords.hourFigures(hour("2026-11-09T13:00:00Z", "go"), airplane = true))
        assertEquals("07:00: No-go. Ceiling 800 ft at KMSN", HourWords.hourLabel(hour("2026-11-09T13:00:00Z", "no-go"), chicago))
    }
}
