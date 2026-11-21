package app.wingtipmaps.android.about

import app.wingtipmaps.android.api.exportFileName
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/** About's fixed parts: the demo flight every app plans, the credits as
 *  docs/legal/credits.md words them, the open-source licences added to
 *  AboutLibraries' own, and the export's file name. */
class AboutTest {
    @Test
    fun theDemoFlightIsMadisonToOshkoshInAStockSkyhawk() {
        assertEquals("KMSN", DemoFlight.DEPARTURE)
        assertEquals("KOSH", DemoFlight.DESTINATION)
        assertEquals(emptyList<String>(), DemoFlight.STOPS)
        assertEquals("c172", DemoFlight.AIRPLANE)
    }

    @Test
    fun everyCreditIsWordedAsCreditsMdHasIt() {
        // The JVM tests run in the module's folder (apps/android/app).
        val doc = File("../../../docs/legal/credits.md")
        assertTrue("docs/legal/credits.md is missing", doc.exists())
        // Each table row's cells, the header rows left out.
        val rows = doc.readLines().filter { it.startsWith("| ") && !it.startsWith("| Credit |") }
            .map { row -> row.split('|').map(String::trim) }
        for (credit in AboutCredits.data + AboutCredits.software) {
            assertTrue("${credit.what} is not in credits.md", rows.any { it.getOrNull(1) == credit.what && it.getOrNull(2) == credit.terms })
        }
        // Every row but Apple MapKit, which is the iPhone's map.
        assertEquals(rows.size - 1, AboutCredits.data.size + AboutCredits.software.size)
    }

    @Test
    fun theEngineAndTheGlyphsAreAmongTheLicences() {
        // The JVM tests run in the module's folder (apps/android/app).
        val licence = Json.parseToJsonElement(File("aboutlibraries/licenses/wingtip-engine.json").readText()).jsonObject
        // The engine's notices as cargo-about wrote them (scripts/build/licences.sh engine).
        assertEquals(File("../../../engine/licences/NOTICES.txt").readText(), licence.getValue("content").jsonPrimitive.content)
        // Each library added names a licence added beside it.
        for (name in listOf("wingtip-engine", "inter")) {
            val library = Json.parseToJsonElement(File("aboutlibraries/libraries/$name.json").readText()).jsonObject
            val hash = library.getValue("licenses").toString().trim('[', ']', '"')
            assertTrue("$name's licence $hash is not in aboutlibraries/licenses", File("aboutlibraries/licenses").listFiles()!!.any {
                Json.parseToJsonElement(it.readText()).jsonObject.getValue("hash").jsonPrimitive.content == hash
            })
        }
        // The OFL travels with the glyphs drawn from Inter.
        assertTrue(File("src/main/assets/glyphs/Inter-Bold/OFL.txt").readText().contains("SIL OPEN FONT LICENSE Version 1.1"))
    }

    @Test
    fun theExportIsSavedUnderTheGatewaysName() {
        assertEquals("wingtip-maps-2026-11-09.json", exportFileName("attachment; filename=\"wingtip-maps-2026-11-09.json\""))
        assertEquals("evil.json", exportFileName("attachment; filename=\"../../evil.json\""))
        assertEquals("wingtip-maps-2026-11-09.json", exportFileName(null, LocalDate.of(2026, 11, 9)))
    }
}
