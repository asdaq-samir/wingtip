package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The profile's endurance is the engine's after each reserve, from the
 *  airplane's own usable fuel and burn, and none without them. */
class EnduranceTest {
    /** The engine's rule as it answers (engine/crates/procedures
     *  figures/endurance.rs), with the reserves 91.151(a) and 91.167(a)(3) give. */
    private val rule = EnduranceRule { usable, burn, reserve ->
        val reserveMin = mapOf("vfr_day" to 30.0, "vfr_night" to 45.0, "ifr" to 45.0).getValue(reserve)
        val minutes = if (usable != null && burn != null) usable / burn * 60.0 else null
        Result.success(EngineContract.EnduranceAnswer(minutes = minutes, reserveMin = reserveMin, afterReserveMin = minutes?.let { maxOf(0.0, it - reserveMin) }, belowReserve = minutes != null && minutes < reserveMin))
    }

    private fun airplane(usable: Double?, burn: Double?) = AirplaneNow(
        aircraft = "c172",
        figures = listOfNotNull(
            usable?.let { EngineContract.AirplaneFiguresAnswerFiguresItem("usable_fuel_gal", value = it, source = "pilot") },
            burn?.let { EngineContract.AirplaneFiguresAnswerFiguresItem("fuel_burn_gph", value = it, source = "pilot") },
        ),
    )

    @Test
    fun givesTheTimeAfterEachReserve() {
        val e = Endurance.of(airplane(50.0, 10.0), rule)!!
        assertEquals(300.0, e.minutes, 0.0)
        assertEquals(listOf(270.0, 255.0, 255.0), e.after.map { it.minutes })
        assertEquals(listOf(Endurance.Reserve.VFR_DAY, Endurance.Reserve.VFR_NIGHT, Endurance.Reserve.IFR), e.after.map { it.reserve })
    }

    @Test
    fun flagsTanksBelowAReserveAndNeverRefuses() {
        val e = Endurance.of(airplane(5.0, 10.0), rule)!!
        assertEquals(30.0, e.minutes, 0.0)
        assertTrue(e.after.drop(1).all { it.below && it.minutes == 0.0 })
    }

    @Test
    fun noneWithoutTheAirplanesOwnFigures() {
        assertNull(Endurance.of(airplane(null, 10.0), rule))
        assertNull(Endurance.of(airplane(50.0, null), rule))
    }
}
