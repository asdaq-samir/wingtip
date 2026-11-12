package app.wingtipmaps.android.map.flow

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Color
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipColors.Weather
import app.wingtipmaps.android.design.generated.WingtipFlow
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import java.util.Locale

/** The model weather's fields, in the Map Settings menu's order (the
 *  owner's pick, 2026-11-12, the web's NAMES): the wind and what it
 *  carries first, then the sky, then the air, then the Aviation Weather
 *  Center's hazards aloft. `key` is the planner's picture's name. */
enum class FlowKind(val key: String, @StringRes val label: Int, @StringRes val title: Int) {
    WIND("wind", R.string.flow_wind, R.string.flow_title_wind),
    GUST("gust", R.string.flow_gust, R.string.flow_title_gust),
    PRECIP("precip", R.string.flow_precip, R.string.flow_title_precip),
    CLOUD("cloud", R.string.flow_cloud, R.string.flow_title_cloud),
    CEILING("ceiling", R.string.flow_ceiling, R.string.flow_title_ceiling),
    CAPE("cape", R.string.flow_cape, R.string.flow_title_cape),
    TEMP("temp", R.string.flow_temp, R.string.flow_title_temp),
    VIS("vis", R.string.flow_vis, R.string.flow_title_vis),
    ICING("icing", R.string.flow_icing, R.string.flow_title_icing),
    TURB("turb", R.string.flow_turb, R.string.flow_title_turb),
    FRZLVL("frzlvl", R.string.flow_frzlvl, R.string.flow_title_frzlvl),
    TOPS("tops", R.string.flow_tops, R.string.flow_title_tops),
}

/** A legend's mark: a value at its place on the bar, and its words. */
data class Tick(val at: Double, val label: String)

/**
 * One field as the map draws it and the legend explains it (the web's
 * FieldLook): its ramp, the legend's bar (a banded field's bands as equal
 * blocks, so a narrow band reads as well as a wide one), its marks, and
 * how strongly it covers the chart.
 */
data class FlowLook(val ramp: List<Stop>, val bar: List<Stop>, val ticks: List<Tick>, val opacity: Float)

/**
 * The fields' looks from the engine's bands (the web's flowLook.ts and
 * aviationLooks.ts): the precipitation's intensity words by reflectivity
 * (AIM 7-1-12), the ceiling's by AIM 7-1-7's categories and CAPE's by the
 * NWS's (`model_weather_bands`); AWC's icing by its categories and its
 * turbulence by its EDR thresholds (`aviation_grid_bands`). The colours
 * (color.weather.flow-*), the ramps, the banded fields' opacities and how
 * strongly each covers the chart are the design tokens' flow group
 * (WingtipFlow), as the web's flowLook reads them. Pure, so it is tested
 * with the engine's answers written out.
 */
object FlowLooks {
    /** Which weight class's turbulence thresholds the words are said by:
     *  AWC's "Light (< 15,500 lbs)" row (aviationweather.gov GFA help), the
     *  airplanes this app plans for; the legend's title says so. */
    const val TURBULENCE_CLASS = "light"

    private fun tone(colour: Color, alpha: Int) = Ramp.tone(colour, alpha)

    /** A token ramp's stops as the map's: the colour at its opacity. */
    private fun ramp(stops: List<WingtipFlow.Stop>) = stops.map { Stop(it.at, tone(it.colour, it.alpha)) }

    private fun plain(ramp: List<Stop>, ticks: List<Double>, opacity: Float = WingtipFlow.COVER_WASH, label: (Double) -> String = ::whole) =
        FlowLook(ramp, ramp, ticks.map { Tick(it, label(it)) }, opacity)

    private fun whole(v: Double): String = String.format(Locale.US, "%,d", v.toLong())

    /** A banded field's legend: each band an equal block of its colour, its
     *  words at the block's middle. */
    private fun blocks(words: List<String>, colours: List<Color>): Pair<List<Stop>, List<Tick>> {
        val bar = words.indices.flatMap { i -> listOf(Stop(i.toDouble(), tone(colours[i], WingtipFlow.ALPHA_BLOCK)), Stop(i + 0.999, tone(colours[i], WingtipFlow.ALPHA_BLOCK))) }
        return bar to words.mapIndexed { i, w -> Tick(i + 0.5, w) }
    }

    /** Banded steps, each its colour from its least value to the next's, as
     *  AWC's maps draw them; clear under the first (the web's steps). */
    private fun steps(froms: List<Double>, colours: List<Color>, alpha: Int, top: Double): List<Stop> {
        val out = mutableListOf(Stop(froms[0] - 1e-3, tone(colours[0], 0)))
        froms.forEachIndexed { i, from ->
            val next = froms.getOrNull(i + 1) ?: top
            out += Stop(from, tone(colours[i], alpha))
            out += Stop(next - 1e-3, tone(colours[i], alpha))
        }
        return out
    }

    private fun level(ft: Double) = if (ft <= 0) "Sfc" else Format.mapLevel(ft)

    fun looks(bands: EngineContract.ModelWeatherBandsAnswer, aviation: EngineContract.AviationGridBandsAnswer): Map<FlowKind, FlowLook> {
        // The wind and the gusts: one hue deepening with speed, calm nearly
        // clear (Apple Weather's wind map, the owner's screenshot, 2026-11-11).
        val wind = ramp(WingtipFlow.RAMP_WIND)
        val knots = WingtipFlow.SCALE_WIND_TICKS

        // Precipitation in the reflectivity a radar would see: clear under
        // the engine's least, blue to violet to magenta to yellow; the top a
        // step past extreme's floor.
        val p = bands.precip.bands
        val least = bands.precip.leastDbz
        val top = p[3].from + WingtipFlow.SCALE_RAIN_HEADROOM
        val a = WingtipFlow.ALPHA_RAIN
        val rain = listOf(
            Stop(least - 0.1, tone(Weather.FlowRainLight, a[0])),
            Stop(least, tone(Weather.FlowRainLight, a[1])),
            Stop(p[1].from, tone(Weather.FlowRainModerate, a[2])),
            Stop(p[2].from, tone(Weather.FlowRainHeavy, a[3])),
            Stop(p[3].from, tone(Weather.FlowRainExtreme, a[4])),
            Stop(top, tone(Weather.FlowRainExtremeTop, a[5])),
        )
        val edges = listOf(p[0].from, p[1].from, p[2].from, p[3].from, top)
        val rainTicks = p.mapIndexed { i, b -> Tick((edges[i] + edges[i + 1]) / 2, b.word) }

        // The ceiling in the airport marks' category colours, hard-edged at
        // the bands; over VFR's floor it fades to clear by twice that.
        val ceilingColours = listOf(Weather.FlowCeilingLifr, Weather.FlowCeilingIfr, Weather.FlowCeilingMvfr, Weather.FlowCeilingVfr)
        val ceilingAlpha = WingtipFlow.ALPHA_CEILING
        val vfr = bands.ceiling.last().from
        val ceiling = bands.ceiling.flatMapIndexed { i, b ->
            val next = bands.ceiling.getOrNull(i + 1)?.from
            val start = Stop(b.from, tone(ceilingColours[i], ceilingAlpha[i]))
            if (next == null) listOf(start, Stop(vfr * 2, tone(ceilingColours[i], 0))) else listOf(start, Stop(next - 1, start.argb))
        }
        val (ceilingBar, ceilingTicks) = blocks(bands.ceiling.map { b -> if (b.from > 0) "${b.word} ${whole(b.from)}" else b.word }, ceilingColours)

        // CAPE yellow to magenta, clear at none and filling in over the
        // weak band's lower half, so a calm map stays the chart.
        val capeColours = listOf(Weather.FlowCapeWeak, Weather.FlowCapeModerate, Weather.FlowCapeStrong, Weather.FlowCapeExtreme)
        val c = bands.cape
        val ca = WingtipFlow.ALPHA_CAPE
        val cape = listOf(
            Stop(0.0, tone(Weather.FlowCapeWeak, ca[0])),
            Stop(c[1].from / 2, tone(Weather.FlowCapeWeak, ca[1])),
            Stop(c[1].from, tone(Weather.FlowCapeModerate, ca[2])),
            Stop(c[2].from, tone(Weather.FlowCapeStrong, ca[3])),
            Stop(c[3].from, tone(Weather.FlowCapeExtreme, ca[4])),
        )
        val (capeBar, capeTicks) = blocks(c.map { b -> if (b.from > 0) "${b.word} ${whole(b.from)}" else b.word }, capeColours)

        // Solid, as Apple Weather's temperature map is, to -60 so the flight
        // levels' cold is told apart too.
        val temp = ramp(WingtipFlow.RAMP_TEMP)

        // AWC's icing: categories 1 to 4 (0 is none, clear), each a whole step.
        val icingWords = aviation.icing.filter { it.from > 0 }
        val icingColours = listOf(Weather.FlowIcingTrace, Weather.FlowIcingLight, Weather.FlowIcingModerate, Weather.FlowIcingHeavy)
        val icing = steps(icingWords.map { it.from - 0.5 }, icingColours, WingtipFlow.ALPHA_ICING, icingWords.last().from + 0.5)
        val (icingBar, icingTicks) = blocks(icingWords.map { it.word }, icingColours)
        val turbRow = aviation.turbulence.light
        val turbColours = listOf(Weather.FlowTurbLight, Weather.FlowTurbModerate, Weather.FlowTurbSevere, Weather.FlowTurbExtreme)
        val turb = steps(turbRow.map { it.from }, turbColours, WingtipFlow.ALPHA_TURB, 1.0)
        val (turbBar, turbTicks) = blocks(turbRow.map { it.word }, turbColours)
        val frz = ramp(WingtipFlow.RAMP_FRZLVL)
        val tops = ramp(WingtipFlow.RAMP_TOPS)

        return mapOf(
            FlowKind.WIND to plain(wind, knots, WingtipFlow.COVER_TINT),
            FlowKind.GUST to plain(wind, knots, WingtipFlow.COVER_TINT),
            FlowKind.PRECIP to FlowLook(rain, rain, rainTicks, WingtipFlow.COVER_SOLID),
            FlowKind.CLOUD to plain(ramp(WingtipFlow.RAMP_CLOUD), listOf(0.0, 50.0, 100.0)),
            FlowKind.CEILING to FlowLook(ceiling, ceilingBar, ceilingTicks, WingtipFlow.COVER_WASH),
            FlowKind.CAPE to FlowLook(cape, capeBar, capeTicks, WingtipFlow.COVER_WASH),
            FlowKind.TEMP to plain(temp, listOf(-30.0, -15.0, 0.0, 15.0, 30.0, 45.0), WingtipFlow.COVER_SOLID),
            FlowKind.VIS to plain(ramp(WingtipFlow.RAMP_VIS), listOf(0.0, 5.0, 10.0)),
            FlowKind.ICING to FlowLook(icing, icingBar, icingTicks, WingtipFlow.COVER_HAZARD),
            FlowKind.TURB to FlowLook(turb, turbBar, turbTicks, WingtipFlow.COVER_HAZARD),
            FlowKind.FRZLVL to plain(frz, listOf(0.0, 4000.0, 8000.0, 12000.0, 16000.0), WingtipFlow.COVER_WASH, ::level),
            FlowKind.TOPS to FlowLook(tops, tops, listOf(10000.0, 20000.0, 30000.0, 40000.0).map { Tick(it, level(it)) }, WingtipFlow.COVER_WASH),
        )
    }

    /** A tick's place along the bar, 0 at its low end (the web's tickPlace,
     *  the bar laid across rather than down). */
    fun place(bar: List<Stop>, at: Double): Float {
        val low = bar.first().at
        val high = bar.last().at
        return ((at - low) / (high - low)).coerceIn(0.0, 1.0).toFloat()
    }
}
