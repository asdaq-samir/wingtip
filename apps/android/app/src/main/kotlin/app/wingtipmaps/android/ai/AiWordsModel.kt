package app.wingtipmaps.android.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.AssistantSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * One "In Plain Words" on a screen (AiWordsRow): whether it is offered,
 * the words once asked for, and why there are none where that is so.
 * Words are asked for only on the pilot's tap, never on their own, and
 * are cleared when the sources they were made from change.
 */
@HiltViewModel
class AiWordsModel(
    private val say: suspend (AiTask, List<AssistantSource>) -> AiWords.Answer? = AiWords::say,
    private val offered: suspend () -> Boolean = AiWords::offered,
) : ViewModel() {
    /** Hilt's: the words on the phone or the server (AiWords). */
    @Inject
    constructor(words: AiWords) : this(words::say, words::offered)
    data class State(
        val offered: Boolean = false,
        val working: Boolean = false,
        val answer: AiWords.Answer? = null,
        val problem: String? = null,
        /** The sources' key the answer was made from. */
        val key: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var job: Job? = null

    init {
        viewModelScope.launch { _state.update { it.copy(offered = offered()) } }
    }

    /** The sources changed: the words made from the old ones go. */
    fun sourcesAre(key: String) {
        if (_state.value.key == key) return
        job?.cancel()
        _state.update { it.copy(working = false, answer = null, problem = null, key = key) }
    }

    fun ask(task: AiTask, sources: List<AssistantSource>) {
        job?.cancel()
        _state.update { it.copy(working = true, answer = null, problem = null) }
        job = viewModelScope.launch {
            try {
                val answer = say(task, sources)
                _state.update { it.copy(working = false, answer = answer, problem = if (answer == null) NONE else null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(working = false, problem = e.message ?: NONE) }
            }
        }
    }

    companion object {
        const val NONE = "No words could be put to these figures."
    }
}
