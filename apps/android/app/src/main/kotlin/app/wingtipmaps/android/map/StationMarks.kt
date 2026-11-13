package app.wingtipmaps.android.map

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.weatherWorse
import app.wingtipmaps.android.engine.generated.windArrow
import app.wingtipmaps.android.engine.generated.windBarb
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.util.Locale
import kotlin.math.roundToInt

/** A reporting field's weather as the map has it (the planner's fields in
 *  view): its METAR's wind, visibility and ceiling as decoded today, and
 *  the least crosswind its runways leave (the engine's `least_crosswind`,
 *  worked out by the planner, which has the runways). */
data class FieldWx(
    val ident: String,
    val lat: Double,
    val lon: Double,
    val category: String?,
    val windFromDeg: Double?,
    val windKt: Double?,
    val gustKt: Double?,
    val leastCrosswindKt: Double?,
    val visibility: String?,
    val ceiling: String?,
)

/** What StationLayer draws at a field: the barb's picture (red past the
 *  airplane's demonstrated crosswind) and where the wind is from, "VRB05"
 *  for a variable wind no barb can point, the two lines, whether the
 *  wind is drawn zoomed out too, and the badge. */
data class FieldMark(
    val ident: String,
    val lat: Double,
    val lon: Double,
    val barb: String?,
    val fromDeg: Double?,
    val lines: String?,
    val worse: Boolean,
    val variable: String? = null,
    val far: Boolean = false,
    val over: Boolean = false,
)

/**
 * Each reporting field's marks, every rule the engine's (the owner's pick,
 * 2026-11-10): the barb and calm by `wind_barb`, whether the barb is drawn
 * zoomed out and whether it is red by `wind_arrow` against the picked
 * airplane's demonstrated crosswind (none picked or no figure, never red;
 * the owner, 2026-11-12: barbs as the Aviation Weather Center's map draws
 * them, in place of arrows), and the badge by `weather_worse`, the
 * field's METAR now against its TAF for the plan's time there. Only how
 * the figures are written is the app's.
 */
object StationMarks {
    /** The rules asked, the engine's; a test's own in its place. */
    interface Rules {
        fun barb(speedKt: Double): EngineContract.WindBarbAnswer?
        fun arrow(speedKt: Double?, gustKt: Double?, crosswindKt: Double?, demonstratedKt: Double?): EngineContract.WindArrowAnswer?
        fun worse(now: List<EngineContract.WorseField>, atEta: List<EngineContract.WorseField>): Set<String>
    }

    object EngineRules : Rules {
        override fun barb(speedKt: Double) = Engine.windBarb(speedKt).getOrNull()

        override fun arrow(speedKt: Double?, gustKt: Double?, crosswindKt: Double?, demonstratedKt: Double?) =
            Engine.windArrow(speedKt, gustKt, crosswindKt, demonstratedKt).getOrNull()

        override fun worse(now: List<EngineContract.WorseField>, atEta: List<EngineContract.WorseField>): Set<String> =
            worseIdents(Engine.weatherWorse(reading(now), reading(atEta)).getOrNull())
    }

    /** A plan field's readings as weather_worse takes TAFs where the
     *  flight lands: each `arrival`, so every field the plan uses is
     *  compared (departure, stops, destination, alternates). */
    fun reading(fields: List<EngineContract.WorseField>) = EngineContract.WeatherReading(tafs = fields.map { it.copy(arrival = true) })

    /** The fields whose TAF the engine says is worse by then. */
    fun worseIdents(answer: EngineContract.WeatherWorseAnswer?): Set<String> =
        answer?.worse.orEmpty().filter { it.kind == "taf" }.mapNotNull { it.ident }.toSet()

    /** A field's marks; [demonstratedKt] the picked airplane's maximum
     *  demonstrated crosswind, null with none picked or no figure. */
    fun mark(field: FieldWx, demonstratedKt: Double?, worse: Set<String>, rules: Rules = EngineRules): FieldMark {
        val kt = field.windKt
        val drawn = kt?.let { rules.barb(it) }
        val shown = if (kt != null || field.gustKt != null) rules.arrow(kt, field.gustKt, field.leastCrosswindKt, demonstratedKt) else null
        val over = shown?.over == true
        // Calm needs no direction; any other barb does, so a variable wind
        // is written as the METAR writes it, "VRB05".
        val from = field.windFromDeg
        val barb = drawn?.takeIf { it.calm || from != null }?.let { StationPictures.barbId(it, over) }
        val variable = if (drawn != null && barb == null) "VRB" + String.format(Locale.US, "%02d", kt.roundToInt()) else null
        val lines = listOfNotNull(field.visibility, field.ceiling).joinToString("\n").ifEmpty { null }
        return FieldMark(
            ident = field.ident, lat = field.lat, lon = field.lon, barb = barb, fromDeg = from, lines = lines, worse = field.ident in worse,
            variable = variable, far = shown?.shown == true && drawn != null, over = over,
        )
    }

    /** What TalkBack says of a field's weather after its name: "IFR,
     *  wind 220 at 18 gusting 26"; calm (the engine's `wind_barb`, so what
     *  is said is what the barb draws: 0 to 2 kt) or variable as such; ""
     *  for none. Where the engine cannot say whether it is calm
     *  (Engine.rule has logged why), its figures are said. */
    fun said(field: FieldWx, rules: Rules = EngineRules): String {
        val parts = mutableListOf<String>()
        field.category?.let { parts += it }
        val kt = field.windKt
        when {
            kt == null -> {}
            rules.barb(kt)?.calm == true -> parts += "wind calm"
            else -> {
                val dir = field.windFromDeg?.let { String.format(Locale.US, "%03d", it.roundToInt()) } ?: "variable"
                val gust = field.gustKt?.takeIf { it > kt }?.let { " gusting ${it.roundToInt()}" }.orEmpty()
                parts += "wind $dir at ${kt.roundToInt()}$gust"
            }
        }
        return parts.joinToString(", ")
    }

    /** The picked airplane's maximum demonstrated crosswind, from its
     *  profile's figures (the POH's, `crosswind.demonstrated_kt`); null
     *  with none picked or no figure, so nothing is assumed. */
    fun demonstratedKt(profile: Map<String, JsonElement>?): Double? =
        ((profile?.get("crosswind") as? JsonObject)?.get("demonstrated_kt") as? JsonPrimitive)?.doubleOrNull

    /** Each field's marks, a field's kept while its weather, the airplane's
     *  figure and its badge are as they were, so a new box of fields asks
     *  the engine only of the fields that changed. */
    class Kept(private val rules: Rules = EngineRules) {
        private var demonstrated: Double? = null
        private val kept = HashMap<String, Pair<Pair<FieldWx, Boolean>, FieldMark>>()

        @Synchronized
        fun marks(fields: Collection<FieldWx>, demonstratedKt: Double?, worse: Set<String>): List<FieldMark> {
            if (demonstratedKt != demonstrated) {
                kept.clear()
                demonstrated = demonstratedKt
            }
            val seen = HashSet<String>()
            val out = fields.map { f ->
                seen += f.ident
                val key = f to (f.ident in worse)
                kept[f.ident]?.takeIf { it.first == key }?.second ?: mark(f, demonstratedKt, worse, rules).also { kept[f.ident] = key to it }
            }
            kept.keys.retainAll(seen)
            return out
        }
    }
}
