package app.wingtipmaps.android.map.flow

import android.content.Context
import app.wingtipmaps.android.R
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.capeCategory
import app.wingtipmaps.android.engine.generated.icingSeverity
import app.wingtipmaps.android.engine.generated.precipIntensity
import app.wingtipmaps.android.engine.generated.turbulenceCategory
import app.wingtipmaps.android.format.Format
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The value read where the pilot tapped, in words (the web's FlowBubble):
 * the wind where it blows from and its speed; the precipitation's
 * intensity word (the engine's precip_intensity, AIM 7-1-12); CAPE its
 * figure and the NWS's category (cape_category); AWC's icing and
 * turbulence their words (icing_severity, turbulence_category); the
 * freezing level and the cloud tops their level; the ceiling its feet
 * above the ground, or none; the others their figure and unit. Every word
 * of a rule is the engine's; only how a figure is written is the app's.
 */
object FlowReading {
    /** The ceiling's picture holds 50 ft a step to its top, where a ceiling
     *  over it and none are both kept (the weather service's flow_grid):
     *  either is no ceiling a category turns on (AIM 7-1-7's highest bound
     *  is 3,000 ft), so it reads as none. */
    private fun nearTop(value: Double, top: Double?) = top != null && value >= top - 25

    private fun whole(v: Double) = String.format(Locale.US, "%,d", v.roundToInt())

    fun words(context: Context, field: FlowKind, read: FlowGrid.Reading, top: Double?): String {
        val v = read.value
        return when (field) {
            FlowKind.WIND -> context.getString(R.string.flow_wind_reading, (read.fromDeg ?: 0.0).roundToInt() % 360, v.roundToInt())
            FlowKind.GUST -> "${v.roundToInt()} kt"
            FlowKind.PRECIP -> Engine.precipIntensity(v).getOrNull()?.word ?: context.getString(R.string.flow_none)
            FlowKind.CLOUD -> "${v.roundToInt()}%"
            FlowKind.CEILING -> if (nearTop(v, top)) context.getString(R.string.flow_no_ceiling) else "${whole(v)} ft"
            FlowKind.CAPE -> listOfNotNull("${whole(v)} J/kg", Engine.capeCategory(v).getOrNull()).joinToString(", ")
            FlowKind.TEMP -> "${v.roundToInt()}°C"
            FlowKind.VIS -> String.format(Locale.US, "%.1f SM", v)
            FlowKind.ICING -> Engine.icingSeverity(v).getOrNull() ?: context.getString(R.string.flow_none)
            FlowKind.TURB -> listOf(
                Engine.turbulenceCategory(v, FlowLooks.TURBULENCE_CLASS).getOrNull() ?: context.getString(R.string.flow_none),
                String.format(Locale.US, "EDR %.2f", v),
            ).joinToString(", ")
            FlowKind.FRZLVL -> if (v <= 0) context.getString(R.string.flow_freezing_surface) else "${Format.mapLevel(v)} MSL"
            FlowKind.TOPS -> "${Format.mapLevel(v)} MSL"
        }
    }
}
