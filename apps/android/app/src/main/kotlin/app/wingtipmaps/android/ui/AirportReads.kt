package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.airportDataWords
import app.wingtipmaps.android.engine.generated.airportNotamsNone
import app.wingtipmaps.android.engine.generated.airportUseWords
import app.wingtipmaps.android.engine.generated.fuelNames
import app.wingtipmaps.android.engine.generated.gonogoRunwayInUse
import app.wingtipmaps.android.engine.generated.notamSubject
import app.wingtipmaps.android.plates.APPROACH_CHART

/**
 * What the airport card shows read by the engine, asked by its model
 * (AirportModel) rather than by the card's views: the field's NOTAMs in
 * words, the badges on what they address, the Runways tab's Longest and
 * Best Wind, and the fuel grades by their names.
 */
object AirportReads {
    /** The card's NOTAMs read once each, best first, with the badges they
     *  put on the card's things and the runways' badges after them. */
    data class Read(
        val ident: String? = null,
        val said: List<FieldNotams.Said>? = null,
        val marks: NotamMarks = NotamMarks.NONE,
        val badges: RunwayBadges = RunwayBadges(-1, -1),
        val words: PlaceWords = PlaceWords(),
    )

    /**
     * The card's lines on the field itself, every one the planner's or the
     * engine's, the same words the web and the iPhone show: `closed`, the
     * planner's label for a field NASR lists as closed ("Closed
     * indefinitely", decision 0043); `use`, airport_use_words' "Private:
     * permission required" or "Military: prior permission required" (none
     * for a public or joint-use field); `data`, airport_data_words'
     * "Owner-reported, last updated Aug 2023" (NASR's INSPECT_METHOD_CODE
     * 1 or 2); and `notamsNone`, airport_notams_none's empty NOTAM list for
     * a private field NASR gives no NOTAM id. Each null where it says nothing.
     */
    data class PlaceWords(val closed: String? = null, val use: String? = null, val data: String? = null, val notamsNone: String? = null)

    fun read(place: AirportPlace, ranked: NotamsRanked?): Read {
        val said = ranked?.notams?.sortedBy { it.rank }?.map { FieldNotams.say(it, place.ident) }
        val marks = notamMarks(ranked?.notams.orEmpty(), place)
        return Read(place.ident, said, marks, runwayBadges(place, marks), words(place))
    }

    fun words(place: AirportPlace): PlaceWords = PlaceWords(
        closed = place.closed?.ifBlank { null },
        use = Engine.airportUseWords(place.isPrivate, place.military).getOrNull()?.words,
        data = Engine.airportDataWords(place.dataSource, place.infoDate).getOrNull(),
        notamsNone = Engine.airportNotamsNone(place.isPrivate, place.military, place.notamId).getOrNull(),
    )

    /** The fuel grades by their names (the engine's fuel_names); null with
     *  none listed, or where the engine could not say (the codes then). */
    fun fuelNames(types: List<String>): String? = if (types.isEmpty()) null else Engine.fuelNames(types).getOrNull()

    /** NotamMarks: each NOTAM in force read by the engine's `notam_subject`
     *  against the card's own runways, lights, approaches and frequencies. */
    fun notamMarks(notams: List<RankedNotam>, place: AirportPlace): NotamMarks {
        val approaches = place.procedures.orEmpty().filter { it.kind == APPROACH_CHART }
        val idents = FieldNotams.identsOf(place.ident)
        val runways = place.runways.map { it.ends.orEmpty() }
        val lights = place.lights.orEmpty().map { EngineContract.NotamSubjectInputLightsItem(it.code, it.name, it.runways) }
        val frequencies = place.frequencies.map { EngineContract.NotamSubjectInputFrequenciesItem(it.type, it.frequencyMhz) }
        var field: NotamMark? = null
        var fuel: NotamMark? = null
        val runway = mutableMapOf<Int, NotamMark>()
        val light = mutableMapOf<Int, NotamMark>()
        val frequency = mutableMapOf<Int, NotamMark>()
        val approach = mutableMapOf<String, NotamMark>()
        for (n in notams) {
            if (!FieldNotams.active(n)) continue
            val badges = Engine.notamSubject(n.raw, FieldNotams.isTfr(n), idents, runways, lights, approaches.map { it.name }, frequencies).getOrNull()?.badges.orEmpty()
            for (b in badges) {
                val i = b.index ?: -1
                when (b.on) {
                    "field" -> field = add(field, b, n)
                    "fuel" -> fuel = add(fuel, b, n)
                    "runway" -> runway[i] = add(runway[i], b, n)
                    "light" -> light[i] = add(light[i], b, n)
                    "frequency" -> frequency[i] = add(frequency[i], b, n)
                    "approach" -> approaches.getOrNull(i)?.url?.let { url -> approach[url] = add(approach[url], b, n) }
                }
            }
        }
        return NotamMarks(field, fuel, runway, light, frequency, approach)
    }

    /** One more NOTAM on a thing: its badge where it is the worse (a
     *  closure over a caution), else the first's, in the engine's order. */
    private fun add(prior: NotamMark?, b: EngineContract.NotamSubjectAnswerBadgesItem, n: RankedNotam): NotamMark {
        val mark = NotamMark(b.word, b.severity, b.label, listOf(n))
        if (prior == null) return mark
        val notams = if (n in prior.notams) prior.notams else prior.notams + n
        return if (!prior.unusable && mark.unusable) mark.copy(notams = listOf(n) + notams.filter { it != n }) else prior.copy(notams = notams)
    }

    /** RunwayBadges: Longest of the open runways, and Best Wind by the
     *  engine's gonogo_runway_in_use where the wind chose it; a runway a
     *  NOTAM closes counts as closed. */
    fun runwayBadges(place: AirportPlace, marks: NotamMarks): RunwayBadges {
        val closed = place.runways.mapIndexed { i, r -> r.closed || marks.runway[i]?.unusable == true }
        val open = place.runways.indices.filter { !closed[it] && place.runways[it].lengthFt != null }
        val longest = if (open.size > 1) open.maxBy { place.runways[it].lengthFt ?: 0 } else -1
        val asked = place.runways.mapIndexed { i, r ->
            EngineContract.Runway(
                closed = closed[i], surface = r.surface, lengthFt = r.lengthFt?.toDouble(),
                runwayEnds = r.runwayEnds?.map { EngineContract.RunwayRunwayEndsItem(it.ident, it.headingTrueDeg) },
                wind = r.wind?.let { EngineContract.GonogoRunwayWind(it.end, it.headwindKt, it.crosswindKt, it.gustCrosswindKt, crosswindExactKt = it.crosswindExactKt, inUse = it.inUse) },
            )
        }
        val inUse = if (asked.isEmpty()) null else Engine.gonogoRunwayInUse(asked).getOrNull()
        return RunwayBadges(longest, inUse?.takeIf { it.byWind }?.runway ?: -1)
    }
}
