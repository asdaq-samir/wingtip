package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.airplaneFigures
import app.wingtipmaps.android.engine.generated.airplaneNeeds
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Locale

/** The engine's airplane rules (engine/crates/pilot aircraft/figures), a fake in the tests. */
interface FigureRules {
    fun figures(book: JsonObject?, handbook: Map<String, JsonElement>?, own: Map<String, JsonElement>?): Result<EngineContract.AirplaneFiguresAnswer>
    fun needs(profile: Map<String, JsonElement>?, figure: String): Result<List<String>>
}

object EngineFigures : FigureRules {
    override fun figures(book: JsonObject?, handbook: Map<String, JsonElement>?, own: Map<String, JsonElement>?) =
        Engine.airplaneFigures(book, handbook, own)

    override fun needs(profile: Map<String, JsonElement>?, figure: String) = Engine.airplaneNeeds(profile, figure).map { it.missing }
}

/**
 * The airplane flown as every screen shows it: the planner's stock type
 * picked ("" for none), its N-number, the pilot's record of it, and the
 * engine's figures for it -- each with its source, "book" (the type's
 * stock profile), "handbook" (a photographed page) or "pilot" -- and the
 * merged profile every other rule takes (null: no airplane).
 */
data class AirplaneNow(
    val aircraft: String = "",
    val tail: String? = null,
    val record: OwnRecord? = null,
    val figures: List<EngineContract.AirplaneFiguresAnswerFiguresItem> = emptyList(),
    val profile: Map<String, JsonElement>? = null,
) {
    fun figure(key: FigureKey) = figures.firstOrNull { it.key == key.key }

    fun value(key: FigureKey): Double? = figure(key)?.value

    val glideRatio: Double? get() = value(FigureKey.GLIDE)

    /** What the airplane is called in a question: "N123AB", else "C172". */
    val name: String? get() = tail ?: record?.type?.ifEmpty { null }?.uppercase() ?: aircraft.ifEmpty { null }?.uppercase()

    /** The record an edit goes over: the pilot's, else a new one for the
     *  N-number (else the type) carrying the book's cruise and burn, which
     *  the account's record requires (an equal figure reads as the book's). */
    fun base(): OwnRecord = record ?: OwnRecord(
        tail = tail, type = aircraft,
        figures = listOf(FigureKey.CRUISE, FigureKey.BURN).mapNotNull { k -> value(k)?.let { k.key to it } }.toMap(),
    )

    companion object {
        fun of(aircraft: String, tail: String?, record: OwnRecord?, book: JsonObject?, rules: FigureRules = EngineFigures): AirplaneNow {
            val own = record?.figures?.mapValues { JsonPrimitive(it.value) }?.ifEmpty { null }
            val handbook = record?.handbook?.mapNotNull { (k, v) ->
                FigureKey.of(k)?.handbookName?.let { it to JsonObject(mapOf("value" to JsonPrimitive(v))) }
            }?.toMap()?.ifEmpty { null }
            val answer = if (book == null && own == null && handbook == null) null else rules.figures(book, handbook, own).getOrNull()
            return AirplaneNow(aircraft, tail, record, answer?.figures.orEmpty(), answer?.profile)
        }

        /** The airplane as the planner is asked it: the stock type picked,
         *  else "own" -- a pilot's airplane of no stock type, planned on its
         *  record's figures alone (wingtip.planning.OWN_AIRPLANE) -- where
         *  the record has the cruise speed and burn that needs, else none:
         *  distances and courses only, no airplane assumed (decision 0011). */
        fun plannerName(aircraft: String, record: OwnRecord?): String? =
            aircraft.ifEmpty { null } ?: if (record?.plannable == true) "own" else null

        /** The planner's query for the airplane: its name and, over a stock
         *  type or as the whole of an own one, every figure its pilot or
         *  its photographed page gave (the pilot's over the page's). */
        fun plannerQuery(aircraft: String, record: OwnRecord?): Map<String, String?> {
            val name = plannerName(aircraft, record) ?: return mapOf("aircraft" to null)
            return mapOf("aircraft" to name) + given(record).mapValues { (_, v) -> String.format(Locale.US, "%s", v) }
        }

        /** The figures the planner takes over the airplane's book, the
         *  pilot's over a photographed page's, by key. */
        fun given(record: OwnRecord?): Map<String, Double> =
            record?.let { it.handbook + it.figures }.orEmpty().filterKeys { FigureKey.of(it)?.planner == true }

        /** The inputs `figure` needs that the airplane lacks and the pilot
         *  can give, less those put off for now: none with no airplane,
         *  whose figures wait on picking one (its own prompt), and none for
         *  a table (loading, takeoff, landing) only a handbook page gives. */
        fun asks(airplane: AirplaneNow, figure: String, hidden: Set<String>, rules: FigureRules = EngineFigures): List<FigureKey> {
            val profile = airplane.profile ?: return emptyList()
            val missing = rules.needs(profile, figure).getOrNull().orEmpty()
            return missing.mapNotNull(FigureKey::of).filter { it.key !in hidden }
        }
    }
}
