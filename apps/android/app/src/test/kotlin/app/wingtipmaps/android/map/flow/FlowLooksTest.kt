package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.design.generated.WingtipColors.Weather
import app.wingtipmaps.android.design.generated.WingtipFlow
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The fields' looks from the engine's bands, as the web's flowLook.ts:
 *  written out here as model_weather_bands and aviation_grid_bands answer
 *  (engine/crates/weather), since the unit tests run without the engine. */
class FlowLooksTest {
    private val bands = EngineContract.ModelWeatherBandsAnswer(
        precip = EngineContract.ModelWeatherBandsAnswerPrecip(
            leastDbz = 10.0,
            bands = listOf("Light" to 10.0, "Moderate" to 26.0, "Heavy" to 40.0, "Extreme" to 50.0).map { (w, f) -> EngineContract.ModelWeatherBandsAnswerPrecipBandsItem(w, f) },
        ),
        ceiling = listOf("LIFR" to 0.0, "IFR" to 500.0, "MVFR" to 1000.0, "VFR" to 3000.0).map { (w, f) -> EngineContract.ModelWeatherBandsAnswerCeilingItem(w, f) },
        cape = listOf("Weak" to 0.0, "Moderate" to 1000.0, "Strong" to 2500.0, "Extreme" to 4000.0).map { (w, f) -> EngineContract.ModelWeatherBandsAnswerCapeItem(w, f) },
    )
    private val aviation = EngineContract.AviationGridBandsAnswer(
        icing = listOf("None" to 0.0, "Trace" to 1.0, "Light" to 2.0, "Moderate" to 3.0, "Heavy" to 4.0).map { (w, f) -> EngineContract.AviationGridBandsAnswerIcingItem(w, f) },
        turbulence = EngineContract.AviationGridBandsAnswerTurbulence(
            light = listOf("Light" to 0.13, "Moderate" to 0.16, "Severe" to 0.36, "Extreme" to 0.5).map { (w, f) -> EngineContract.AviationGridBandsAnswerTurbulenceLightItem(w, f) },
            medium = emptyList(),
            heavy = emptyList(),
        ),
    )
    private val looks = FlowLooks.looks(bands, aviation)

    @Test
    fun everyFieldHasALook() {
        assertEquals(FlowKind.entries.toSet(), looks.keys)
    }

    @Test
    fun rainIsClearUnderTheEnginesLeastAndColouredFromIt() {
        val rain = Ramp(looks.getValue(FlowKind.PRECIP).ramp)
        assertEquals(0, rain.colour(5.0) ushr 24)
        assertEquals(WingtipFlow.ALPHA_RAIN[1], rain.colour(10.0) ushr 24)
        // Its words, the engine's, at the middles of their bands.
        assertEquals(listOf("Light", "Moderate", "Heavy", "Extreme"), looks.getValue(FlowKind.PRECIP).ticks.map { it.label })
    }

    @Test
    fun theCeilingIsHardEdgedAtItsBandsAndClearHighUp() {
        val ceiling = Ramp(looks.getValue(FlowKind.CEILING).ramp)
        // Just under IFR's floor is LIFR's colour, at IFR's floor IFR's.
        assertEquals(ceiling.colour(0.0), ceiling.colour(499.0))
        assertTrue(ceiling.colour(499.0) != ceiling.colour(500.0))
        assertEquals(0, ceiling.colour(6000.0) ushr 24)
        assertEquals("IFR 500", looks.getValue(FlowKind.CEILING).ticks[1].label)
    }

    @Test
    fun icingIsClearAtNone() {
        val icing = Ramp(looks.getValue(FlowKind.ICING).ramp)
        assertEquals(0, icing.colour(0.0) ushr 24)
        assertEquals(WingtipFlow.ALPHA_ICING, icing.colour(3.0) ushr 24)
    }

    @Test
    fun theRampsAndCoversAreTheDesignTokens() {
        // design/tokens.json's flow group, as the web's flowLook reads it:
        // the wind calm nearly clear in its calm colour, the temperature solid.
        val wind = looks.getValue(FlowKind.WIND)
        assertEquals(Ramp.tone(Weather.FlowWindCalm, WingtipFlow.RAMP_WIND[0].alpha), wind.ramp[0].argb)
        assertEquals(WingtipFlow.RAMP_WIND.map { it.at }, wind.ramp.map { it.at })
        assertEquals(WingtipFlow.COVER_TINT, wind.opacity)
        assertEquals(WingtipFlow.COVER_SOLID, looks.getValue(FlowKind.TEMP).opacity)
        assertEquals(WingtipFlow.COVER_HAZARD, looks.getValue(FlowKind.TURB).opacity)
        assertEquals(WingtipFlow.RAMP_TEMP.size, looks.getValue(FlowKind.TEMP).ramp.size)
    }

    @Test
    fun aTickIsPlacedAlongTheBar() {
        val wind = looks.getValue(FlowKind.WIND)
        assertEquals(0f, FlowLooks.place(wind.bar, 0.0))
        assertEquals(1f, FlowLooks.place(wind.bar, 75.0))
        assertEquals(1f / 3, FlowLooks.place(wind.bar, 25.0), 1e-6f)
    }
}
