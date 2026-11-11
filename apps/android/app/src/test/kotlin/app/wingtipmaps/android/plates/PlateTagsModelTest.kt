package app.wingtipmaps.android.plates

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The plate tags' model: the engine's approach_fix_tags answer (here as
 * it answers KOSH's ILS or LOC RWY 36 in the owner's ForeFlight
 * screenshot, 2026-11-11: POBER the IAF and FAF at or above 2,700 with the
 * glide slope at 2,610, CFBSM at or above 2,700, the runway with its TCH
 * and TDZE, LEWKO's missed approach hold at or above 3,000) written as the
 * plates write them, barred as the FAA charts an altitude, and drawn as
 * the map's points and final line; each approach asked once.
 */
class PlateTagsModelTest {
    private fun tag(
        ident: String,
        lat: Double,
        lon: Double,
        roles: List<String>,
        altitude: EngineContract.ApproachFixTagAltitude? = null,
        vertical: EngineContract.ApproachFixTagVertical? = null,
        runway: EngineContract.ApproachFixTagRunway? = null,
    ) = EngineContract.ApproachFixTag(ident, lat, lon, roles, missed = "hold" in roles, altitude = altitude, vertical = vertical, runway = runway)

    private fun above(ft: Double) = EngineContract.ApproachFixTagAltitude("at_or_above", minFt = ft)

    private val kosh = EngineContract.ApproachFixTagsAnswer(
        tags = listOf(
            tag("POBER", 43.913, -88.556, listOf("IAF", "FAF"), above(2700.0), EngineContract.ApproachFixTagVertical("glideslope", 2610.0, 3.0, "cifp")),
            tag("CFBSM", 43.889, -88.556, listOf("IF"), above(2700.0)),
            tag("RW36", 43.976, -88.557, listOf("MAP"), runway = EngineContract.ApproachFixTagRunway(thresholdFt = 809.0, tchFt = 53.0, tdzeFt = 809.0)),
            tag("LEWKO", 44.040, -88.330, listOf("hold"), above(3000.0)),
        ),
        final = EngineContract.ApproachFixTagsAnswerFinal(
            "POBER",
            "RW36",
            listOf(listOf(JsonPrimitive(43.913), JsonPrimitive(-88.556)), listOf(JsonPrimitive(43.976), JsonPrimitive(-88.557))),
        ),
    )

    @Test
    fun aTagIsTheFixesNameItsAltitudeBarredAsChartedAndItsGlideSlope() {
        assertEquals(
            listOf(TagLine("POBER"), TagLine("2,700'", under = true), TagLine("GS 2,610'")),
            PlateTagWords.lines(kosh.tags[0]),
        )
        val gp = kosh.tags[0].copy(vertical = EngineContract.ApproachFixTagVertical("glidepath", 2612.4, 3.0, "computed"))
        assertEquals(TagLine("GP 2,612'"), PlateTagWords.lines(gp).last())
    }

    @Test
    fun eachSenseIsBarredAsTheFaaChartsIt() {
        fun alt(sense: String, min: Double?, max: Double?) = EngineContract.ApproachFixTagAltitude(sense, min, max)
        assertEquals(listOf(TagLine("3,000'", over = true)), PlateTagWords.crossing(alt("at_or_below", null, 3000.0)))
        assertEquals(listOf(TagLine("2,000'", under = true, over = true)), PlateTagWords.crossing(alt("at", 2000.0, 2000.0)))
        assertEquals(
            listOf(TagLine("4,000'", over = true), TagLine("3,000'", under = true)),
            PlateTagWords.crossing(alt("between", 3000.0, 4000.0)),
        )
        assertTrue(PlateTagWords.crossing(null).isEmpty())
    }

    @Test
    fun theRunwaysTagHasItsTchAndTdzeAndNoMinimums() {
        assertEquals(listOf(TagLine("RW36"), TagLine("TCH 53' · TDZE 809'")), PlateTagWords.lines(kosh.tags[2]))
        val noTdze = kosh.tags[2].copy(runway = EngineContract.ApproachFixTagRunway(thresholdFt = 809.0, tchFt = 53.0, tdzeFt = null))
        assertEquals(TagLine("TCH 53'"), PlateTagWords.lines(noTdze).last())
    }

    @Test
    fun theMapDrawsATagAPointNamingItsPictureAndTheFinalAsALine() {
        val drawing = PlateTagsModel.drawing(listOf(kosh))
        val points = Json.parseToJsonElement(drawing.points).jsonObject["features"]!!.jsonArray
        assertEquals(4, points.size)
        val images = points.map { it.jsonObject["properties"]!!.jsonObject["image"]!!.jsonPrimitive.content }
        assertEquals(images.toSet(), drawing.labels.keys)
        assertTrue(drawing.labels.values.single { it.lines.first().text == "RW36" }.runway)
        assertFalse(drawing.labels.values.single { it.lines.first().text == "POBER" }.runway)
        val finals = Json.parseToJsonElement(drawing.finals).jsonObject["features"]!!.jsonArray
        assertEquals(1, finals.size)
        // GeoJSON's order: longitude first.
        val first = finals[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray[0].jsonArray
        assertEquals(-88.556, first[0].jsonPrimitive.content.toDouble(), 0.0)
        assertEquals(0, Json.parseToJsonElement(PlateTagsModel.drawing(listOf(kosh.copy(final = null))).finals).jsonObject["features"]!!.jsonArray.size)
    }

    @Test
    fun eachApproachIsAskedOnceAndOneNotAnsweredIsAskedAgain() = runBlocking {
        val asked = mutableListOf<PlatePick>()
        var answer: Tags? = null
        val model = PlateTagsModel(this) { pick ->
            asked += pick
            answer
        }
        val pick = PlatePick("KOSH", "I36")
        model.want(listOf(pick))
        yield()
        model.want(listOf(pick))
        yield()
        assertEquals(2, asked.size)
        answer = kosh
        model.want(listOf(pick))
        yield()
        model.want(listOf(pick))
        yield()
        assertEquals(3, asked.size)
        assertEquals(kosh, model.tags.value[pick])
    }
}
