package app.wingtipmaps.android.emergency

import app.wingtipmaps.android.api.AirportPin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The packs' fields shaped as the planner's answers, for Emergency and
 *  Nearest with no planner, and nothing the packs lack made up. The box
 *  and the order are the engine's (fields_near, best_fields), held by its
 *  own tests: a JVM test has no engine, so the fields come here ranked. */
class PhoneFieldsTest {
    private fun pin(ident: String, military: String? = null) =
        AirportPin(ident = ident, kind = "small", lat = 42.0, lon = -88.0, name = "$ident Field", military = military, isPrivate = false, towered = false)

    private fun near() =
        listOf("C81" to 3.4, "KUGN" to 6.2, "10C" to 9.9).map { (ident, nm) -> PhoneFields.Near(pin(ident), nm, 45.0, groundFt = 900.0) }

    @Test
    fun theCandidatesCarryThePacksUseAndNothingMadeUp() {
        val c = PhoneFields.candidates(listOf(pin("KFHU", military = "joint"))).single()
        assertEquals("joint", c.military)
        assertTrue(c.runways.isEmpty())
        assertNull(c.metar)
        assertNull(c.elevationFt)
        // The packs hold open fields only: no status is sent for the engine to read.
        assertNull(c.status)
    }

    @Test
    fun noPinsAreRankedWithoutAskingTheEngine() {
        assertTrue(PhoneFields.ranked(emptyList(), 42.0, -88.0, 10) { null }.isEmpty())
    }

    @Test
    fun theEmergencyAnswerCarriesNoWeatherRunwaysOrGuessedGlide() {
        val none = PhoneFields.emergency(near(), airplaneName = "C172", glideRatio = null)
        assertNull(none.airplane)
        assertNull(none.wind)
        val c81 = none.fields.first()
        assertNull(c81.metar)
        assertTrue(c81.runways.isEmpty())
        assertNull(c81.frequencies)
        // The packs' ground under it stands for its height.
        assertEquals(900.0, c81.elevationFt!!, 0.0)
        val own = PhoneFields.emergency(near(), airplaneName = "N123AB", glideRatio = 9.0)
        assertEquals(9.0, own.airplane!!.glide!!.ratio, 0.0)
        assertNull(own.airplane.glide.bestGlideKias)
    }

    @Test
    fun theEmergencyFieldsCarryTheUseAsItComes() {
        // A joint-use field (KFHU) is no "Military field" to best_fields;
        // only the string tells it from one the services keep to themselves.
        val fields = PhoneFields.emergency(
            listOf(pin("KFHU", military = "joint"), pin("KMXF", military = "military"), pin("C81")).map { PhoneFields.Near(it, 1.0, 90.0, null) },
            airplaneName = null, glideRatio = null,
        ).fields.associate { it.ident to it.military }
        assertEquals(mapOf("KFHU" to "joint", "KMXF" to "military", "C81" to null), fields)
    }

    @Test
    fun nearestRowsKeepThePinsOwnFacts() {
        val rows = PhoneFields.nearestRows(listOf(PhoneFields.Near(pin("KMKE", military = "joint"), 1.0, 90.0, null)))
        assertEquals("joint", rows.single().military)
        assertNull(rows.single().flightCategory)
        assertEquals(90.0, rows.single().bearingDeg, 0.0)
    }
}
