package app.wingtipmaps.android.checklist

import android.content.SharedPreferences
import app.wingtipmaps.android.engine.Engine
import kotlinx.serialization.Serializable

/**
 * An airplane's own checklists, kept on this phone: two plain texts per
 * airplane, the normal procedures and the emergency ones, written by the
 * pilot from the airplane's flight manual (#220, the owner's pick of
 * 2026-11-08: free, local). The app writes none of the items itself: the
 * manual's are the airplane's, and a copy of one would be the
 * manufacturer's words and could be wrong for this airplane.
 *
 * The text is the engine's checklist format, the one the web app and
 * the iPhone app read (lib/checklist, PilotLogic.swift's ChecklistText):
 * a line starting "#" a section, every other line "Challenge -- Response".
 * The engine reads it (`checklist_read`); nothing here parses it.
 */
enum class ChecklistKind(val title: String) {
    NORMAL("Normal"),
    EMERGENCY("Emergency"),
}

/** One line of a checklist as the engine reads it: what is checked, and
 *  what it should be (none for an item that is only said). */
@Serializable
data class ChecklistItem(val challenge: String, val response: String? = null)

@Serializable
data class ChecklistSection(val title: String, val items: List<ChecklistItem> = emptyList())

/** The engine's ChecklistRead, the gateway's ChecklistDto. */
@Serializable
data class ChecklistRead(val sections: List<ChecklistSection> = emptyList())

@Serializable
private class ChecklistReadAsk(val text: String)

/** Where a few short texts are kept: SharedPreferences on the phone, a
 *  map in the tests, so the rules of keeping them are held on the JVM. */
interface TextStore {
    fun read(key: String): String?

    /** The text kept under `key`; null takes it away. */
    fun write(key: String, value: String?)
}

/** A TextStore over the app's SharedPreferences. */
class PreferencesStore(private val prefs: SharedPreferences) : TextStore {
    override fun read(key: String): String? = prefs.getString(key, null)

    override fun write(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

/**
 * The checklists kept per airplane, by the key the plan knows the
 * airplane by (Plan.State.aircraft, the planner's type for now; an
 * airplane by its N-number is a later phase and would key the same way).
 * Each starts empty: nothing is kept until the pilot writes it.
 */
class ChecklistStore(private val store: TextStore) {
    private fun key(airplane: String, kind: ChecklistKind) =
        "checklist.${airplane.trim().lowercase()}.${kind.name.lowercase()}"

    /** The list as written, "" where nothing has been. */
    fun text(airplane: String, kind: ChecklistKind): String = store.read(key(airplane, kind)) ?: ""

    /** The list kept as written; an empty one is taken away, so the
     *  airplane is back to having none. */
    fun save(airplane: String, kind: ChecklistKind, text: String) {
        store.write(key(airplane, kind), text.takeIf { it.isNotBlank() })
    }
}

/**
 * The headings a pilot can start a list from: the phases alone, in the
 * order a pilot's operating handbook sets them, with no items under
 * them. Every item is the pilot's to copy from the airplane's own
 * manual, so nothing here can be mistaken for it.
 *
 * Normal: the order of a POH's Section 4, Normal Procedures, in GAMA
 * Specification No. 1 (Specification for Pilot's Operating Handbook),
 * which the FAA's Airplane Flying Handbook (FAA-H-8083-3C, chapter 2)
 * has the pilot fly by checklist from preflight to securing.
 * Emergency: the situations of the same specification's Section 3,
 * Emergency Procedures, in its order.
 *
 * A heading with nothing under it is dropped when the engine reads the
 * list, so the run view shows only the sections the pilot has filled.
 */
object ChecklistPhases {
    val NORMAL: List<String> = listOf(
        "Preflight inspection",
        "Before starting engine",
        "Starting engine",
        "Before takeoff",
        "Takeoff",
        "Climb",
        "Cruise",
        "Descent",
        "Before landing",
        "Landing",
        "After landing",
        "Shutdown",
        "Securing the airplane",
    )

    val EMERGENCY: List<String> = listOf(
        "Engine failure on the takeoff roll",
        "Engine failure right after takeoff",
        "Engine failure in flight",
        "Emergency landing without engine power",
        "Precautionary landing with engine power",
        "Ditching",
        "Engine fire during start",
        "Engine fire in flight",
        "Electrical fire in flight",
        "Cabin fire",
        "Electrical power failure",
        "Inadvertent icing",
    )

    fun headings(kind: ChecklistKind): List<String> = when (kind) {
        ChecklistKind.NORMAL -> NORMAL
        ChecklistKind.EMERGENCY -> EMERGENCY
    }

    /** The headings as the editor's starting text: each a "# " line,
     *  with a blank line under it to write the items in. */
    fun template(kind: ChecklistKind): String = headings(kind).joinToString("\n\n", postfix = "\n") { "# $it" }
}

/** A list run through: which items are ticked, by "section/item". */
object ChecklistRun {
    fun key(section: Int, item: Int): String = "$section/$item"

    /** How many of a section's items are ticked, "n of m" beside its title. */
    fun done(sections: List<ChecklistSection>, section: Int, ticked: Set<String>): Int =
        sections.getOrNull(section)?.items?.indices?.count { key(section, it) in ticked } ?: 0
}

/** The engine reading a list typed as text (`checklist_read`). */
object ChecklistText {
    fun read(text: String): List<ChecklistSection> =
        if (text.isBlank()) emptyList() else Engine.call<ChecklistReadAsk, ChecklistRead>("checklist_read", ChecklistReadAsk(text)).sections
}
