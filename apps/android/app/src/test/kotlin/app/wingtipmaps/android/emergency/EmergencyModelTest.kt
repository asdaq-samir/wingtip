package app.wingtipmaps.android.emergency

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.EmergencyField
import app.wingtipmaps.android.api.generated.EmergencyFields
import app.wingtipmaps.android.api.generated.EmergencyFrequency
import app.wingtipmaps.android.api.generated.EmergencyMetar
import app.wingtipmaps.android.checklist.ChecklistSection
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The emergency assistant's model over fakes of the planner and the
 *  engine: the fields asked as the airplane moves, the first ranked
 *  picked, the checklist opened at the emergency, the MAYDAY filled. */
class EmergencyModelTest {
    @get:Rule val main = MainRule()

    private fun field(ident: String, nm: Double, bearing: Double) = EmergencyField(
        bearingDeg = bearing, distanceNm = nm, ident = ident, lat = 42.0, lon = -88.0, name = "$ident Field", runways = emptyList(),
        phone = "555-0100", frequencies = listOf(EmergencyFrequency(kind = "TWR", mhz = 120.5)),
    )

    private class Rules : EmergencyRules {
        var facts: MaydayFacts? = null
        var frequencies = 0
        override fun bestFields(data: EmergencyFields, fix: OwnShip.Fix) = Result.success(
            EngineContract.BestFieldsAnswer(
                mode = "glide", needsAirplane = data.airplane == null,
                fields = data.fields.sortedBy { it.distanceNm }.map {
                    EngineContract.BestField(
                        ident = it.ident, name = it.name, lat = it.lat, lon = it.lon, distanceNm = it.distanceNm, courseDeg = it.bearingDeg,
                        reach = "unknown", towered = false, private = false, military = null, reasons = emptyList(),
                    )
                },
            ),
        )
        override fun mayday(facts: MaydayFacts, data: EmergencyFields?): Result<EngineContract.MaydayCallAnswer> {
            this.facts = facts
            frequencies = data?.fields?.sumOf { it.frequencies.orEmpty().size } ?: 0
            return Result.success(EngineContract.MaydayCallAnswer(lines = listOf("MAYDAY MAYDAY MAYDAY"), words = "", missing = emptyList(), squawk = "7700", squawkWords = "", channels = emptyList()))
        }
        override fun checklistSection(titles: List<String>) = titles.indexOfFirst { it.startsWith("Engine failure in flight") }.takeIf { it >= 0 }
        override fun sections(text: String) = if (text.isEmpty()) emptyList() else listOf(
            ChecklistSection("Engine fire", emptyList()),
            ChecklistSection("Engine failure in flight", listOf(EngineContract.ChecklistReadSectionsItemItemsItem("Airspeed", "68 KIAS"))),
        )
        override fun compassWord(bearingDeg: Double) = if (bearingDeg in 180.0..270.0) "SW" else "NE"
        override fun guidance() = listOf(EngineContract.EmergencyGuidanceAnswerItemsItem(title = "Squawk 7700", detail = "Then talk to ATC", source = "AIM 6-2-2"))
    }

    private val fix = OwnShip.Fix(lat = 42.1, lon = -88.1, altitudeFt = 4520.0, trackDeg = 300.0, groundspeedKt = 100.0, accuracyM = 5.0, atMs = 0L)

    @Test
    fun theFieldsAreRankedAndTheMaydayFilled() {
        var asks = 0
        var askedAircraft: String? = "?"
        val rules = Rules()
        val model = EmergencyModel({ _, _, alt, aircraft, _ -> asks++; askedAircraft = aircraft; assertEquals(4500.0, alt!!, 0.0); EmergencyFields(fields = listOf(field("KUGN", 6.2, 30.0).copy(metar = EmergencyMetar(visibilitySm = 10.0, visibilityPlus = true)), field("C81", 3.4, 45.0))) }, rules)
        model.start(aircraft = "c172", airplaneName = "C172", callsign = null, checklist = "# x")
        model.took(fix, trackMagDeg = 304.0)
        val s = model.state.value
        assertEquals(1, asks)
        assertEquals("c172", askedAircraft)
        assertEquals("C81", s.picked!!.ident)
        assertEquals("555-0100", s.phone)
        // The report's visibility, "more than" kept; none where no report says one.
        assertEquals(mapOf("KUGN" to "10+ sm"), s.visibility)
        // The checklist opened at the engine failure, the section the call names.
        assertEquals(1, s.section)
        val facts = rules.facts!!
        assertEquals("Engine failure in flight", facts.nature)
        assertEquals("Landing at C81 Field, C81", facts.intentions)
        assertEquals("3 nm SW of C81 Field", facts.position)
        assertEquals(304.0, facts.headingMagDeg!!, 0.0)
        assertEquals(4500.0, facts.altitudeFt!!, 0.0)
        assertEquals(2, rules.frequencies)
        // A small move asks nothing new; the pilot's pick and words stand.
        model.took(fix.copy(lat = 42.1001), trackMagDeg = 304.0)
        assertEquals(1, asks)
        model.pick("KUGN")
        model.souls("2 people")
        assertEquals("KUGN", model.state.value.picked!!.ident)
        assertEquals(2.0, rules.facts!!.souls!!, 0.0)
    }

    @Test
    fun noAirplaneAndNoChecklistAreSaidNotGuessed() {
        var askedAircraft: String? = "?"
        val model = EmergencyModel({ _, _, _, aircraft, _ -> askedAircraft = aircraft; EmergencyFields(fields = listOf(field("C81", 3.4, 45.0))) }, Rules())
        model.start(aircraft = "", airplaneName = null, callsign = null, checklist = "")
        model.took(fix, trackMagDeg = null)
        assertNull(askedAircraft)
        assertTrue(model.state.value.ranked!!.needsAirplane)
        assertNull(model.state.value.section)
    }

    @Test
    fun withNoAirplaneTheGuidanceShowsInPlaceOfAChecklistAndWithOneItDoesNot() {
        val none = EmergencyModel({ _, _, _, _, _ -> EmergencyFields(fields = listOf(field("C81", 3.4, 45.0))) }, Rules())
        none.start(aircraft = "", airplaneName = null, callsign = null, checklist = "")
        // The engine's general guidance, each item with its source; the
        // sheet shows it (NoAirplaneGuidance) where a checklist would be.
        assertEquals(listOf("Squawk 7700"), none.state.value.guidance.map { it.title })
        assertEquals("AIM 6-2-2", none.state.value.guidance.single().source)
        val picked = EmergencyModel({ _, _, _, _, _ -> EmergencyFields(fields = emptyList()) }, Rules())
        picked.start(aircraft = "c172", airplaneName = "C172", callsign = null, checklist = "# x")
        assertTrue(picked.state.value.guidance.isEmpty())
    }

    @Test
    fun withNoPlannerTheFieldsAreThePhonesAndSaidSo() {
        val offline = java.io.IOException("no route to host")
        val model = EmergencyModel(
            { _, _, _, _, _ -> throw offline },
            Rules(),
            onPhone = { _, _, _, _, _ -> EmergencyFields(fields = listOf(field("C81", 3.4, 45.0))) },
            work = main.dispatcher,
        )
        model.start(aircraft = "c172", airplaneName = "C172", callsign = null, checklist = "")
        model.took(fix, trackMagDeg = null)
        val s = model.state.value
        assertTrue(s.onPhone)
        assertNull(s.problem)
        assertEquals("C81", s.picked!!.ident)
    }

    @Test
    fun withNeitherThePlannersFailureIsSaidInPlainWords() {
        val model = EmergencyModel(
            { _, _, _, _, _ -> throw java.io.IOException("failed to connect to /10.0.2.2") },
            Rules(),
            onPhone = { _, _, _, _, _ -> throw PhoneFields.NoPacks() },
            work = main.dispatcher,
        )
        model.start(aircraft = "c172", airplaneName = "C172", callsign = null, checklist = "")
        model.took(fix, trackMagDeg = null)
        assertEquals("The fields could not be had: there is no connection to Wingtip.", model.state.value.problem)
        assertFalse(model.state.value.onPhone)
    }

    @Test
    fun thePilotsOwnWordsOpenIt() {
        assertTrue(EmergencyOpen.asked("Mayday mayday"))
        assertTrue(EmergencyOpen.asked("engine failure"))
        assertTrue(EmergencyOpen.asked("I have an emergency"))
        assertFalse(EmergencyOpen.asked("KDPA to KMSN"))
        assertFalse(EmergencyOpen.asked("engine start"))
    }
}
