package app.wingtipmaps.android.plates

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** A chart's ink kept by the chart and its cycle (PlateInk): the same
 *  plate in the next d-TPP cycle is the same chart in a new cycle, and
 *  opening it drops the last cycle's ink. */
class PlateInkTest {
    @get:Rule val folder = TemporaryFolder()

    private val nov = "https://aeronav.faa.gov/d-tpp/2511/00123IL36.PDF"
    private val dec = "https://aeronav.faa.gov/d-tpp/2512/00123IL36.PDF"

    @Test
    fun aPlatesCycleIsReadFromItsAddress() {
        val a = PlateInk.key(nov)
        val b = PlateInk.key(dec)
        assertEquals("2511", a.cycle)
        assertEquals("2512", b.cycle)
        assertEquals(a.chart, b.chart)
        assertNotEquals(a.file, b.file)
        // Another plate is another chart.
        assertNotEquals(a.chart, PlateInk.key("https://aeronav.faa.gov/d-tpp/2511/00123RY18.PDF").chart)
        // A chart with no cycle in its address keeps by its address alone.
        assertEquals("", PlateInk.key("https://example.org/chart.pdf").cycle)
    }

    @Test
    fun theNextCycleStartsCleanAndTheLastIsDropped() {
        val dir: File = folder.root
        val old = File(dir, PlateInk.key(nov).file + ".json").apply { writeText("[]") }
        val other = File(dir, PlateInk.key("https://aeronav.faa.gov/d-tpp/2511/00123RY18.PDF").file + ".json").apply { writeText("[]") }
        PlateInk.dropOtherCycles(dir, PlateInk.key(dec))
        assertFalse(old.exists())
        assertTrue(other.exists())
    }
}
