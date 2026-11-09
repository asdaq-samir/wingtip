package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.R
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The airplane as the planner is asked it (never a stock type's figures
 *  for an own one), the inline asks the engine's airplane_needs gives, the
 *  profile's sources, and its edits saved over the record. */
class AirplaneNowTest {
    @get:Rule val main = MainRule()

    /** The engine's rules, as far as the asks need them: the profile is
     *  what it is given, and needs names the keys of `missing`. */
    private class Rules(val missing: List<String>) : FigureRules {
        var own: Map<String, JsonElement>? = null
        override fun figures(book: JsonObject?, handbook: Map<String, JsonElement>?, own: Map<String, JsonElement>?): Result<EngineContract.AirplaneFiguresAnswer> {
            this.own = own
            val figures = listOf(EngineContract.AirplaneFiguresAnswerFiguresItem("taxi_fuel_gal", value = 1.1, source = "pilot", book = 1.4))
            return Result.success(EngineContract.AirplaneFiguresAnswer(figures, profile = (book ?: emptyMap()) + own.orEmpty()))
        }
        override fun needs(profile: Map<String, JsonElement>?, figure: String) =
            Result.success(if (profile == null) listOf("airplane") else missing)
    }

    @Test
    fun anOwnAirplaneIsPlannedOnItsOwnFiguresAndNoneOnAnyOther() {
        val own = OwnRecord(tail = "N9XY", figures = mapOf("cruise_tas_kt" to 140.0, "fuel_burn_gph" to 10.0, "empty_weight_lb" to 1650.0))
        val q = AirplaneNow.plannerQuery("", own)
        assertEquals("own", q["aircraft"])
        assertEquals("140.0", q["cruise_tas_kt"])
        // The empty weight is the weight and balance's, not the planner's.
        assertFalse("empty_weight_lb" in q)
        // Without its cruise and burn it is no airplane to the planner.
        assertEquals(mapOf("aircraft" to null), AirplaneNow.plannerQuery("", OwnRecord(tail = "N9XY", figures = mapOf("glide_ratio" to 10.0))))
        // A stock type picked carries the pilot's figures over its book.
        assertEquals(mapOf("aircraft" to "c172", "taxi_fuel_gal" to "1.1"), AirplaneNow.plannerQuery("c172", OwnRecord(type = "c172", figures = mapOf("taxi_fuel_gal" to 1.1))))
        assertNull(AirplaneNow.plannerName("", null))
    }

    @Test
    fun theAsksAreTheMissingFiguresLessThosePutOff() {
        val rules = Rules(missing = listOf("taxi_fuel_gal", "loading"))
        val airplane = AirplaneNow.of("c172", "N123AB", null, JsonObject(mapOf("cruise_tas_kt" to JsonPrimitive(122))), rules)
        assertEquals(listOf(FigureKey.TAXI), AirplaneNow.asks(airplane, "fuel_totals", emptySet(), rules))
        assertTrue(AirplaneNow.asks(airplane, "fuel_totals", setOf("taxi_fuel_gal"), rules).isEmpty())
        // No airplane: nothing asked, picking one is.
        assertTrue(AirplaneNow.asks(AirplaneNow(), "glide", emptySet(), rules).isEmpty())
        assertEquals("N123AB", airplane.name)
    }

    @Test
    fun anEditMakesTheNNumbersRecordFromTheBooksCruiseAndBurn() {
        val rules = Rules(missing = emptyList())
        val airplane = AirplaneNow(aircraft = "c172", tail = "N123AB").copy(
            figures = listOf(
                EngineContract.AirplaneFiguresAnswerFiguresItem("cruise_tas_kt", 122.0, "book", 122.0),
                EngineContract.AirplaneFiguresAnswerFiguresItem("fuel_burn_gph", 8.5, "book", 8.5),
            ),
        )
        assertEquals(OwnRecord(tail = "N123AB", type = "c172", figures = mapOf("cruise_tas_kt" to 122.0, "fuel_burn_gph" to 8.5)), airplane.base())
        AirplaneNow.of("c172", "N123AB", OwnRecord(tail = "N123AB", figures = mapOf("glide_ratio" to 10.0)), null, rules)
        assertEquals(mapOf("glide_ratio" to JsonPrimitive(10.0)), rules.own)
    }

    @Test
    fun eachSourceHasItsWordsAndOnlyThePilotsResets() {
        assertEquals(R.string.source_pilot, AirplaneProfileModel.sourceLabel("pilot"))
        assertEquals(R.string.source_handbook, AirplaneProfileModel.sourceLabel("handbook"))
        assertEquals(R.string.source_book, AirplaneProfileModel.sourceLabel("book"))
        assertEquals(R.string.source_none, AirplaneProfileModel.sourceLabel(null))
        assertTrue(AirplaneProfileModel.resettable("pilot", 1.4))
        assertFalse(AirplaneProfileModel.resettable("pilot", null))
        assertFalse(AirplaneProfileModel.resettable("book", 1.4))
    }

    @Test
    fun aFigureIsANumberAndOnlyTaxiFuelMayBeNone() {
        assertEquals(8.5, FigureKey.parse(FigureKey.BURN, "8,5")!!, 0.0)
        assertNull(FigureKey.parse(FigureKey.BURN, "0"))
        assertEquals(0.0, FigureKey.parse(FigureKey.TAXI, "0")!!, 0.0)
        assertNull(FigureKey.parse(FigureKey.GLIDE, "-9"))
        assertNull(FigureKey.parse(FigureKey.GLIDE, "nine"))
        assertEquals("9 to 1", FigureKey.GLIDE.show(9.0))
        assertEquals("8.5 gph", FigureKey.BURN.show(8.5))
    }

    @Test
    fun theProfileSavesTheFigureTypedAndKeepsAWrongOneOpen() {
        val saved = mutableListOf<Pair<OwnRecord, Map<String, Double?>>>()
        val own = object : OwnSaving {
            override suspend fun save(base: OwnRecord, changes: Map<String, Double?>) {
                saved += base to changes
            }
            override suspend fun reset(base: OwnRecord, key: String, book: Double?) {
                saved += base to mapOf(key to null)
            }
        }
        val airplane = AirplaneNow(aircraft = "c172", tail = "N123AB", record = OwnRecord(tail = "N123AB", type = "c172", id = 3))
        val model = AirplaneProfileModel()
        model.edit("taxi_fuel_gal", null)
        model.type("lots")
        model.save(airplane, own)
        assertTrue(saved.isEmpty())
        assertTrue(model.state.value.problem != null)
        model.type("1.1")
        model.save(airplane, own)
        assertEquals(mapOf("taxi_fuel_gal" to 1.1), saved.single().second)
        assertNull(model.state.value.editing)
        model.reset(airplane, FigureKey.TAXI, own)
        assertEquals(mapOf("taxi_fuel_gal" to null), saved.last().second)
    }
}
