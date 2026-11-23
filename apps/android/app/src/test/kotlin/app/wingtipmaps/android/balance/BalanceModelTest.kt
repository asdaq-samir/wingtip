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
    fun theGradePickedGoesToTheEngineTheLoadingAsTheProfileHasIt() {
        // Which weight a gallon wins is the engine's (gonogo_balance, its
        // shared cases): the load carries the pick, none for the POH's.
        val loading = EngineContract.GonogoLoading(2558.0, 2550.0, 2550.0, 1663.0, 64887.0, fuelArmIn = 48.0, fuelMaxGal = 53.0, fuelLbPerGal = 6.0)
        val state = BalanceModel.State(loading = loading, emptyWeightLb = 1663.0, stations = listOf("170"), fuel = "40", grade = "jet_a")
        val load = BalanceModel.loadOf(state)
        assertEquals("jet_a", load.fuelGrade)
        assertEquals(listOf(170.0), load.stationsLb)
        assertEquals(40.0, load.fuelGal, 0.0)
        assertNull(BalanceModel.loadOf(state.copy(grade = null)).fuelGrade)
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
