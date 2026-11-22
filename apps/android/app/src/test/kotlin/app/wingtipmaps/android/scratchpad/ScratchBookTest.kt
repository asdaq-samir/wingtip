package app.wingtipmaps.android.scratchpad

import app.wingtipmaps.android.api.Gateway
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The scratchpad's pages as kept: each change to the page it names only,
 *  Undo taking back the last stroke, the book read back as written, and
 *  a flight's file named from its route. */
class ScratchBookTest {
    private val craft = ScratchPage("a", Template.CRAFT, 1L)
    private val blank = ScratchPage("b", Template.BLANK, 2L)
    private val book = ScratchBook().add(craft).add(blank)

    @Test
    fun aFieldTypedChangesItsOwnPageOnly() {
        val typed = book.field("a", "clearance_limit", "KMSN airport")
        assertEquals("KMSN airport", typed.pages[0].fields["clearance_limit"])
        assertTrue(typed.pages[1].fields.isEmpty())
    }

    @Test
    fun undoTakesBackTheLastStrokeAndClearTakesAll() {
        val written = book.write("b", listOf(InkLine(4f, "AA"), InkLine(4f, "BB")))
        assertEquals(listOf("AA"), written.undo("b").pages[1].ink.map { it.inputs })
        assertTrue(written.clearInk("b").pages[1].ink.isEmpty())
        assertEquals(listOf("b"), written.remove("a").pages.map { it.id })
    }

    @Test
    fun theBookReadsBackAsWritten() {
        val written = book.field("a", "transponder", "4521").write("a", listOf(InkLine(3.5f, "CQ==")))
        val text = Gateway.json.encodeToString(ScratchBook.serializer(), written)
        assertEquals(written, Gateway.json.decodeFromString(ScratchBook.serializer(), text))
    }

    @Test
    fun aFlightsFileIsNamedByItsRoute() {
        val dir = File("pads")
        assertEquals("KOSH-KMSN.json", ScratchModel.fileOf(dir, "KOSH||KMSN").name)
        assertEquals("KOSH-KJVL-KMSN.json", ScratchModel.fileOf(dir, "KOSH|KJVL|KMSN").name)
        assertEquals("unplanned.json", ScratchModel.fileOf(dir, "||").name)
    }

    @Test
    fun theTemplatesCarryTheirFieldsInOrder() {
        // AIM 4-4-3's items in the CRAFT order; AIM 4-1-13's the pilot sets.
        assertEquals(listOf("clearance_limit", "route", "altitude", "frequency", "transponder"), Template.CRAFT.fields.map { it.key })
        assertEquals(listOf("information", "wind", "altimeter", "runway", "remarks"), Template.ATIS.fields.map { it.key })
        assertTrue(Template.BLANK.fields.isEmpty())
    }
}
