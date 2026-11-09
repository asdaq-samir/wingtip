package app.wingtipmaps.android.about

import app.wingtipmaps.android.api.exportFileName
import java.io.File
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** About's fixed parts: the demo flight every app plans, the credits as
 *  docs/legal/credits.md words them, and the export's file name. */
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
    fun theExportIsSavedUnderTheGatewaysName() {
        assertEquals("wingtip-maps-2026-11-09.json", exportFileName("attachment; filename=\"wingtip-maps-2026-11-09.json\""))
        assertEquals("evil.json", exportFileName("attachment; filename=\"../../evil.json\""))
        assertEquals("wingtip-maps-2026-11-09.json", exportFileName(null, LocalDate.of(2026, 11, 9)))
    }
}
