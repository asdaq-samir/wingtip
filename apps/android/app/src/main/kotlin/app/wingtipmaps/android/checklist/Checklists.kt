package app.wingtipmaps.android.checklist

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.checklistPhases
import app.wingtipmaps.android.engine.generated.checklistRead

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

/** One line of a checklist as the engine reads it (`checklist_read`):
 *  what is checked, and what it should be (none for an item that is only
 *  said). */
typealias ChecklistItem = EngineContract.ChecklistReadSectionsItemItemsItem

/** A heading of a list and the items under it. */
typealias ChecklistSection = EngineContract.ChecklistReadSectionsItem

/** Where a few short texts are kept: a DataStore on the phone (Kept), a
 *  map in the tests, so the rules of keeping them are held on the JVM. */
interface TextStore {
    fun read(key: String): String?

    /** The text kept under `key`; null takes it away. */
    fun write(key: String, value: String?)

    /** Every text kept taken away. */
    fun clear()
}

/** A TextStore over one of the app's stores (Kept). */
class PreferencesStore(private val prefs: Kept) : TextStore {
    override fun read(key: String): String? = prefs[stringPreferencesKey(key)]

    override fun write(key: String, value: String?) {
        val k = stringPreferencesKey(key)
        prefs.edit { if (value == null) it.remove(k) else it.set(k, value) }
    }

    override fun clear() {
        prefs.edit { it.clear() }
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

    /** Every airplane's lists forgotten, as signing out forgets what the
     *  phone kept of the pilot's (the owner's "sign-out clears",
     *  2026-10-20, held for the checklists on 2026-11-08). */
    fun forgetAll() = store.clear()

    companion object {
        /** The phone's own keeping: a store of their own. */
        fun of(context: Context) = ChecklistStore(PreferencesStore(Kept.of(context, "checklists")))
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
    /** The headings, the engine's (`checklist_phases`), as the web and
     *  the iPhone start from them; a failure the model shows. */
    val NORMAL: Result<List<String>> by lazy { Engine.checklistPhases("normal") }

    val EMERGENCY: Result<List<String>> by lazy { Engine.checklistPhases("emergency") }

    fun headings(kind: ChecklistKind): Result<List<String>> = when (kind) {
        ChecklistKind.NORMAL -> NORMAL
        ChecklistKind.EMERGENCY -> EMERGENCY
    }

    /** The headings as the editor's starting text: each a "# " line,
     *  with a blank line under it to write the items in. */
    fun template(kind: ChecklistKind): Result<String> =
        headings(kind).map { it.joinToString("\n\n", postfix = "\n") { h -> "# $h" } }
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
    fun read(text: String): Result<List<ChecklistSection>> =
        if (text.isBlank()) Result.success(emptyList()) else Engine.checklistRead(text).map { it.sections }
}
