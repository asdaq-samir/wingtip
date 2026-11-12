package app.wingtipmaps.android.map.flow

import android.content.Context
import app.wingtipmaps.android.R
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
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
 * above the ground, or none (the engine's no_ceiling); the others their figure and unit. Every word
 * of a rule is the engine's; only how a figure is written is the app's.
 */
object FlowReading {
    private fun whole(v: Double) = String.format(Locale.US, "%,d", v.roundToInt())

    /** The badge's word from a rule's answer (the precipitation's
     *  intensity, icing, turbulence): the engine's null as none's word (no
     *  icing, turbulence under light's band), a failed rule kept as the
     *  failure, which must never read as no hazard. */
    fun wordOrNone(rule: Result<String?>, none: String): Result<String> = rule.map { it ?: none }

    /** The wind in words: "Calm" alone under a knot, which has no direction
     *  (FMH-1 Table 5-1, 5.5.2), else its direction and speed as `said`
     *  writes them. */
    fun wind(read: EngineContract.FlowSampleAnswer, calm: String, said: (Int, Int) -> String): String =
        if (read.calm) calm else said((read.fromDeg ?: 0.0).roundToInt() % 360, read.value.roundToInt())

    /** The reading in words, or the failure of the engine rule behind it,
     *  which the bar shows as its problem with no reading (as the web's
     *  callEngine throws). */
    fun words(context: Context, field: FlowKind, read: EngineContract.FlowSampleAnswer): Result<String> = runCatching {
        val v = read.value
        val none = context.getString(R.string.flow_none)
        fun word(rule: Result<String?>) = wordOrNone(rule, none).getOrThrow()
        when (field) {
            FlowKind.WIND -> wind(read, context.getString(R.string.wind_calm)) { from, kt -> context.getString(R.string.flow_wind_reading, from, kt) }
            FlowKind.GUST -> "${v.roundToInt()} kt"
            FlowKind.PRECIP -> word(Engine.precipIntensity(v).map { it.word })
            FlowKind.CLOUD -> "${v.roundToInt()}%"
            // The engine reads the ceiling rounded to its picture's 50 ft, and
            // its top as none (flow_sample's no_ceiling, AIM 7-1-7).
            FlowKind.CEILING -> if (read.noCeiling) context.getString(R.string.flow_no_ceiling) else "${whole(v)} ft"
            FlowKind.CAPE -> listOfNotNull("${whole(v)} J/kg", Engine.capeCategory(v).getOrThrow()).joinToString(", ")
            FlowKind.TEMP -> "${v.roundToInt()}°C"
            FlowKind.VIS -> String.format(Locale.US, "%.1f SM", v)
            FlowKind.ICING -> word(Engine.icingSeverity(v))
            FlowKind.TURB -> listOf(word(Engine.turbulenceCategory(v, FlowLooks.TURBULENCE_CLASS)), String.format(Locale.US, "EDR %.2f", v)).joinToString(", ")
            FlowKind.FRZLVL -> if (v <= 0) context.getString(R.string.flow_freezing_surface) else "${Format.mapLevel(v)} MSL"
            FlowKind.TOPS -> "${Format.mapLevel(v)} MSL"
        }
    }
}
