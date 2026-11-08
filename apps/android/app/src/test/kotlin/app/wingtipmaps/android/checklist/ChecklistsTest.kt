package app.wingtipmaps.android.checklist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A TextStore in a map, for the rules of keeping on the JVM. */
class MemoryStore : TextStore {
    val kept = mutableMapOf<String, String>()

    override fun read(key: String): String? = kept[key]

    override fun write(key: String, value: String?) {
        if (value == null) kept.remove(key) else kept[key] = value
    }
}

/** The checklists kept per airplane (ChecklistStore), the phases'
 *  headings and a run's counts. The engine's reading of the text is held
 *  by its own fixtures (EngineFixturesTest, on the emulator). */
class ChecklistsTest {
    @Test
    fun anAirplaneHasNoChecklistUntilOneIsWritten() {
        val store = ChecklistStore(MemoryStore())
        assertEquals("", store.text("c172", ChecklistKind.NORMAL))
        assertEquals("", store.text("c172", ChecklistKind.EMERGENCY))
    }

    @Test
    fun eachAirplaneKeepsItsOwnNormalAndEmergencyLists() {
        val memory = MemoryStore()
        val store = ChecklistStore(memory)
        store.save("c172", ChecklistKind.NORMAL, "# Before takeoff\nMixture -- Rich")
        store.save("c172", ChecklistKind.EMERGENCY, "# Engine failure in flight\nAirspeed -- Best glide")
        store.save("pa28", ChecklistKind.NORMAL, "# Climb\nFlaps -- Up")
        assertEquals("# Before takeoff\nMixture -- Rich", store.text("c172", ChecklistKind.NORMAL))
        assertEquals("# Engine failure in flight\nAirspeed -- Best glide", store.text("c172", ChecklistKind.EMERGENCY))
        assertEquals("# Climb\nFlaps -- Up", store.text("pa28", ChecklistKind.NORMAL))
        assertEquals("", store.text("pa28", ChecklistKind.EMERGENCY))
        // Read again through a new store over the same keeping, as at the
        // next launch; the airplane's key is read whatever its case.
        assertEquals("# Climb\nFlaps -- Up", ChecklistStore(memory).text("PA28", ChecklistKind.NORMAL))
    }

    @Test
    fun anEmptiedListIsTakenAway() {
        val memory = MemoryStore()
        val store = ChecklistStore(memory)
        store.save("c172", ChecklistKind.NORMAL, "# Cruise\nMixture -- Lean")
        store.save("c172", ChecklistKind.NORMAL, "  \n")
        assertEquals("", store.text("c172", ChecklistKind.NORMAL))
        assertTrue(memory.kept.isEmpty())
    }

    @Test
    fun thePhasesAreHeadingsAloneInTheHandbooksOrder() {
        assertEquals(13, ChecklistPhases.NORMAL.size)
        assertEquals("Preflight inspection", ChecklistPhases.NORMAL.first())
        assertEquals("Securing the airplane", ChecklistPhases.NORMAL.last())
        assertEquals(12, ChecklistPhases.EMERGENCY.size)
        assertEquals("Engine failure on the takeoff roll", ChecklistPhases.EMERGENCY.first())
        assertEquals("Inadvertent icing", ChecklistPhases.EMERGENCY.last())
        val text = ChecklistPhases.template(ChecklistKind.EMERGENCY)
        val lines = text.lines().filter { it.isNotBlank() }
        // Every line a heading: no item, so nothing of a manufacturer's.
        assertTrue(lines.all { it.startsWith("# ") })
        assertEquals(ChecklistPhases.EMERGENCY, lines.map { it.removePrefix("# ") })
        assertFalse(ChecklistPhases.template(ChecklistKind.NORMAL).contains("--"))
    }

    @Test
    fun aSectionCountsItsTickedItems() {
        val sections = listOf(
            ChecklistSection("Before takeoff", listOf(ChecklistItem("Mixture", "Rich"), ChecklistItem("Flaps", "Set"))),
            ChecklistSection("Climb", listOf(ChecklistItem("Flaps", "Up"))),
        )
        val ticked = setOf(ChecklistRun.key(0, 1), ChecklistRun.key(1, 0))
        assertEquals(1, ChecklistRun.done(sections, 0, ticked))
        assertEquals(1, ChecklistRun.done(sections, 1, ticked))
        assertEquals(0, ChecklistRun.done(sections, 0, emptySet()))
        assertEquals(0, ChecklistRun.done(sections, 5, ticked))
    }
}
