package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.api.generated.FlowField
import app.wingtipmaps.android.api.generated.FlowFrame
import app.wingtipmaps.android.api.generated.FlowLayer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The timeline and the pictures' names, as the web's useWeatherFlow and flowLevels. */
class FlowTimelineTest {
    private fun frame(hour: Int, past: Boolean) =
        FlowFrame(fields = listOf("wind"), id = "20261112%02d".format(hour), model = "HRRR and GFS", past = past, valid = "2026-11-12T%02d:00:00Z".format(hour))

    private val frames = listOf(frame(11, true), frame(12, true), frame(14, false), frame(16, false))
    private val layer = FlowLayer(
        bounds = listOf(-180.125, 4.875, -49.875, 75.125), credit = "NOAA", fetchedAt = 0.0,
        fields = mapOf("wind" to FlowField("kt", listOf(-100.0, 100.0), true)), frames = frames,
        levels = mapOf("wind" to listOf("sfc", "060", "max"), "icing" to listOf("030", "060")),
    )

    @Test
    fun nowIsTheNewestPastFrame() {
        assertEquals(1, FlowTimeline.nowIndex(frames))
        assertEquals(0, FlowTimeline.hoursFromNow(frames, 1))
        assertEquals(4, FlowTimeline.hoursFromNow(frames, 3))
        assertEquals(-1, FlowTimeline.hoursFromNow(frames, 0))
    }

    @Test
    fun rainsOneHourSpanIsTheHoursPast() {
        assertEquals(listOf(0, 1), FlowTimeline.windowOf(frames, FlowKind.PRECIP, FlowSpan.ONE_HOUR))
        assertEquals(listOf(0, 1, 2, 3), FlowTimeline.windowOf(frames, FlowKind.PRECIP, FlowSpan.TWELVE_HOURS))
        assertEquals(listOf(0, 1, 2, 3), FlowTimeline.windowOf(frames, FlowKind.WIND, FlowSpan.ONE_HOUR))
    }

    @Test
    fun aPictureIsNamedByItsFieldAndLevel() {
        assertEquals("wind", FlowTimeline.fileOf("wind", "sfc"))
        assertEquals("wind-060", FlowTimeline.fileOf("wind", "060"))
        assertEquals("cape", FlowTimeline.fileOf("cape", null))
        // The temperature has the wind's levels but Max.
        assertEquals(listOf("sfc", "060"), FlowTimeline.levelsOf(layer, FlowKind.TEMP))
        assertEquals("060", FlowTimeline.levelShown(layer, FlowKind.WIND, "060"))
        assertEquals("030", FlowTimeline.levelShown(layer, FlowKind.ICING, "sfc"))
        assertNull(FlowTimeline.levelShown(layer, FlowKind.CAPE, "060"))
    }
}
