package app.wingtipmaps.android.checklist

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

/**
 * The checklist screen's state: which airplane's list is shown, normal
 * or emergency, run through or being written, and the items ticked.
 * One per activity, so a list half run is still ticked when it is opened
 * again from another place (the airplane screen); the
 * ticks last while the app runs, as a paper checklist's finger does,
 * and Start over clears them.
 */
@HiltViewModel
class ChecklistModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    enum class Mode { RUN, EDIT }

    data class State(
        val airplane: String = "",
        val kind: ChecklistKind = ChecklistKind.NORMAL,
        val mode: Mode = Mode.RUN,
        /** The list as kept. */
        val text: String = "",
        /** What the editor holds. */
        val draft: String = "",
        val sections: List<ChecklistSection> = emptyList(),
        val ticked: Set<String> = emptySet(),
        /** Why the list could not be read, in the engine's words. */
        val problem: String? = null,
    )

    private val store = ChecklistStore.of(app)
    private val ticks = mutableMapOf<Pair<String, ChecklistKind>, Set<String>>()

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** An airplane's list shown to be run. */
    fun show(airplane: String, kind: ChecklistKind) {
        val text = store.text(airplane, kind)
        val (sections, problem) = read(text)
        _state.value = State(
            airplane = airplane, kind = kind, text = text, draft = text,
            sections = sections, ticked = ticks[airplane to kind].orEmpty(), problem = problem,
        )
    }

    fun edit() = _state.update { it.copy(mode = Mode.EDIT, draft = it.text) }

    fun draft(text: String) = _state.update { it.copy(draft = text) }

    /** The phases' headings in the editor, to write the items under. */
    fun startFromPhases() = _state.update { s ->
        ChecklistPhases.template(s.kind).fold(
            { s.copy(draft = it) },
            { s.copy(problem = "The phases' headings could not be had: ${it.message}") },
        )
    }

    fun cancelEdit() = _state.update { it.copy(mode = Mode.RUN, draft = it.text) }

    /** The draft kept and read again; the ticks go, since the items
     *  they were for may have moved. */
    fun save() {
        val s = _state.value
        store.save(s.airplane, s.kind, s.draft)
        ticks.remove(s.airplane to s.kind)
        show(s.airplane, s.kind)
    }

    fun tick(section: Int, item: Int) {
        val s = _state.value
        val key = ChecklistRun.key(section, item)
        val ticked = if (key in s.ticked) s.ticked - key else s.ticked + key
        ticks[s.airplane to s.kind] = ticked
        _state.update { it.copy(ticked = ticked) }
    }

    fun startOver() {
        val s = _state.value
        ticks.remove(s.airplane to s.kind)
        _state.update { it.copy(ticked = emptySet()) }
    }

    private fun read(text: String): Pair<List<ChecklistSection>, String?> =
        ChecklistText.read(text).fold({ it to null }, { emptyList<ChecklistSection>() to (it.message ?: "The list could not be read.") })
}
