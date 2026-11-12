package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.aircraft.AircraftForm
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.addAircraft
import app.wingtipmaps.android.api.aircraft
import app.wingtipmaps.android.api.generated.assistant.DocumentRead
import app.wingtipmaps.android.api.generated.assistant.HandbookCheck
import app.wingtipmaps.android.api.generated.assistant.HandbookRead
import app.wingtipmaps.android.api.saveHandbook
import app.wingtipmaps.android.api.updateAircraft
import app.wingtipmaps.android.engine.Engine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * "Add from a Photo" for the airplane's own figures (the web's handbook
 * import, the iPhone's): which page, the page read by the assistant and
 * checked by the engine, each item confirmed by the pilot, the read
 * reduced to what was confirmed and checked again by the engine on the
 * phone (handbook_read_check), its profile filling the airplane's
 * figures; then, on the pilot's own Save, the airplane's record and its
 * handbook figures at the gateway. Nothing is saved before that Save.
 */
class HandbookPhotoModel(
    private val check: (HandbookRead) -> Result<HandbookCheck> = { Engine.rule("handbook_read_check", it) },
    private val rules: AircraftForm.Rules = AircraftForm.EngineRules,
) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    data class State(
        val page: Documents.Kind = Documents.Kind.PERFORMANCE,
        val reading: Boolean = false,
        val problem: String? = null,
        val answer: DocumentRead? = null,
        val confirmed: Set<String> = emptySet(),
        /** The engine's check of the confirmed items alone: what is kept. */
        val kept: HandbookCheck? = null,
        /** The airplane's figures as typed: the "Your Airplane" form. */
        val form: AircraftForm = AircraftForm(),
        /** Save was tried, so each field's problem is shown under it. */
        val tried: Boolean = false,
        /** What is wrong with the form, by field, once Save was tried. */
        val problems: Map<AircraftForm.Field, String> = emptyMap(),
        val saving: Boolean = false,
        val saved: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun pick(page: Documents.Kind) = _state.update { it.copy(page = page) }

    fun read(context: Context, page: Uri) {
        val kind = _state.value.page
        _state.update { it.copy(reading = true, problem = null, answer = null, confirmed = emptySet(), kept = null, saved = false) }
        readJob?.cancel()
        readJob = viewModelScope.launch {
            try {
                take(Documents.read(context.applicationContext, page, kind))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(reading = false, problem = Documents.words(e)) }
            }
        }
    }

    /** The reader's answer, nothing confirmed yet. */
    fun take(answer: DocumentRead) = _state.update { it.copy(reading = false, problem = null, answer = answer, confirmed = emptySet(), kept = null) }

    private var readJob: Job? = null

    /** The sheet closed: a read under way given up, and nothing kept, so
     *  the next opening starts afresh. */
    fun clear() {
        readJob?.cancel()
        _state.value = State()
    }

    fun problem(words: String) = _state.update { it.copy(problem = words) }

    fun toggle(key: String) = _state.update { s ->
        s.copy(confirmed = if (key in s.confirmed) s.confirmed - key else s.confirmed + key)
    }

    /** The confirmed items alone, checked again by the engine; the form
     *  filled from its profile where it gives a figure, the rest kept. */
    fun useConfirmed(tail: String?, type: String) {
        val s = _state.value
        val read = s.answer?.handbook ?: return
        check(HandbookReview.confirmed(read, s.confirmed)).fold(
            onSuccess = { kept ->
                _state.update {
                    val f = it.form
                    val named = f.copy(tailNumber = f.tailNumber.ifEmpty { tail.orEmpty().uppercase() }, typeDesignator = f.typeDesignator.ifEmpty { type.uppercase() })
                    it.copy(kept = kept, problem = null, form = named.filled(kept.profile))
                }
            },
            onFailure = { e -> _state.update { it.copy(problem = "The confirmed figures could not be checked: ${e.message}") } },
        )
    }

    fun edit(how: (AircraftForm) -> AircraftForm) = _state.update { s ->
        how(s.form).let { f -> s.copy(form = f, problems = if (s.tried) f.problems(rules) else emptyMap(), saved = false) }
    }

    /** Back to the items, to confirm another or take one back. */
    fun review() = _state.update { it.copy(kept = null, saved = false) }

    /** The pilot's Save: the airplane by its registration replaced or
     *  added, then, once that is saved, its handbook figures. */
    fun save() {
        val s = _state.value
        val kept = s.kept ?: return
        val problems = s.form.problems(rules)
        if (s.form.request(problems) == null) {
            _state.update { it.copy(tried = true, problems = problems) }
            return
        }
        _state.update { it.copy(saving = true, tried = true, problems = problems, problem = null) }
        viewModelScope.launch {
            try {
                val tail = s.form.tailNumber.trim()
                val was = Gateway.aircraft().orEmpty().firstOrNull { it.tailNumber.equals(tail, ignoreCase = true) }
                // What the page does not give is kept as the pilot set it.
                // The record's own figures in the blanks are checked again.
                val whole = was?.let(s.form::over) ?: s.form
                val ask = checkNotNull(whole.request(whole.problems(rules))) { "The airplane's record is not as the gateway takes it." }
                val saved = if (was != null) Gateway.updateAircraft(was.id, ask) else Gateway.addAircraft(ask)
                Gateway.saveHandbook(saved.id, HandbookReview.forGateway(kept.handbook))
                _state.update { it.copy(saving = false, saved = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val words = (e as? Gateway.Refusal)?.let { r -> r.words ?: "The gateway answered ${r.status}." } ?: e.message
                _state.update { it.copy(saving = false, problem = "The airplane could not be saved: $words") }
            }
        }
    }
}
