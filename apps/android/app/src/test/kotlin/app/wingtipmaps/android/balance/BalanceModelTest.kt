package app.wingtipmaps.android.balance

import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The weight and balance screen's own pieces: a figure as typed, and the
 *  loading read from the airplane's profile. The balance is the engine's
 *  (its own tests, gonogo_balance). */
class BalanceModelTest {
    @Test
    fun aFigureIsANumberNoneBelowZero() {
        assertEquals(170.0, BalanceModel.pounds(" 170 "))
        assertEquals(8.5, BalanceModel.pounds("8,5"))
        assertEquals(0.0, BalanceModel.pounds("0"))
        assertNull(BalanceModel.pounds("-5"))
        assertNull(BalanceModel.pounds(""))
        assertNull(BalanceModel.pounds("full"))
    }

    @Test
    fun theProfilesOwnDensityWinsElseTheGradePicked() {
        // FAA-H-8083-1B's avgas 6.0 and Jet A 6.8 lb/gal, as fuel_grades gives them.
        val grades = listOf(EngineContract.FuelGradesAnswerItem("avgas", "Avgas", 6.0), EngineContract.FuelGradesAnswerItem("jet_a", "Jet A", 6.8))
        val loading = EngineContract.GonogoLoading(2558.0, 2550.0, 2550.0, 1663.0, 64887.0, fuelArmIn = 48.0, fuelMaxGal = 53.0)
        val state = BalanceModel.State(loading = loading, grades = grades, grade = "jet_a")
        assertEquals(6.8, BalanceModel.weighed(state)!!.fuelLbPerGal)
        val own = state.copy(loading = loading.copy(fuelLbPerGal = 6.7))
        assertEquals(6.7, BalanceModel.weighed(own)!!.fuelLbPerGal)
        assertNull(BalanceModel.weighed(BalanceModel.State()))
    }

    @Test
    fun theLoadingIsTheProfilesAndNoneWithNoAirplane() {
        assertNull(BalanceModel.loadingOf(AirplaneNow()))
        val profile = Engine.json.parseToJsonElement(
            """{"loading":{"max_ramp_lb":2558,"max_takeoff_lb":2550,"max_landing_lb":2550,"sample_empty_weight_lb":1663,
            "sample_empty_moment_lb_in":64887,"fuel_arm_in":48,"fuel_max_gal":53,"stations":[{"name":"Front seats","arm_in":37}],
            "envelope":[[35,1500],[35,1950],[39.5,2550],[47.3,2550],[47.3,1500]]}}""",
        ).jsonObject
        val loading = BalanceModel.loadingOf(AirplaneNow(aircraft = "C172", profile = profile))!!
        assertEquals(2550.0, loading.maxTakeoffLb, 0.0)
        assertEquals("Front seats", loading.stations!!.single().name)
        assertEquals(5, loading.envelope!!.size)
        assertNull(BalanceModel.loadingOf(AirplaneNow(aircraft = "C172", profile = JsonObject(emptyMap()))))
    }
}
