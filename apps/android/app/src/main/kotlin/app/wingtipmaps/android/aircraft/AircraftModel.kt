package app.wingtipmaps.android.aircraft

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.accepted
import app.wingtipmaps.android.api.addAircraft
import app.wingtipmaps.android.api.aircraft
import app.wingtipmaps.android.api.deleteAircraft
import app.wingtipmaps.android.api.done
import app.wingtipmaps.android.api.generated.client.apis.GatewayApi
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.api.updateAircraft
import app.wingtipmaps.android.di.Writes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * "Your Airplanes" (the web's own-airplane list in AccountPanels, the
 * iPhone's OwnAircraftListView): the pilot's airplanes the gateway keeps
 * (/api/aircraft), each added, changed or deleted there. The gateway
 * holds the record and works no figure out; nothing here does either.
 * The four calls, and the engine's check of the form, are passed in so
 * the JVM tests answer them.
 */
@HiltViewModel
class AircraftModel(
    private val list: suspend () -> List<AircraftDto>? = { Gateway.aircraft() },
    private val add: suspend (AircraftRequest) -> AircraftDto = { Gateway.addAircraft(it) },
    private val update: suspend (Long, AircraftRequest) -> AircraftDto = { id, r -> Gateway.updateAircraft(id, r) },
    private val delete: suspend (Long) -> Unit = { Gateway.deleteAircraft(it) },
    private val rules: AircraftForm.Rules = AircraftForm.EngineRules,
) : ViewModel() {
    /** Hilt's: the pilot's airplanes from the gateway (/api/aircraft), its writes on their longer limit. */
    @Inject
    constructor(gateway: GatewayApi, @Writes writes: GatewayApi, rules: AircraftForm.Rules) : this(
        { gateway.aircraftList().readOrNone() },
        { writes.aircraftAdd(it).accepted() },
        { id, r -> writes.aircraftUpdate(id, r).accepted() },
        { writes.aircraftDelete(it).done() },
        rules,
    )
    /** One airplane's form open: a new one (id null) or one kept. */
    data class Editing(
        val id: Long? = null,
        val form: AircraftForm = AircraftForm(),
        /** Save was tried, so each field's problem is shown under it. */
        val tried: Boolean = false,
        /** What is wrong, by field, once Save was tried (AircraftForm.problems). */
        val problems: Map<AircraftForm.Field, String> = emptyMap(),
        val saving: Boolean = false,
        /** Delete asked, waiting for the pilot to confirm it. */
        val confirmingDelete: Boolean = false,
    )

    data class State(
        val loading: Boolean = true,
        /** Signed out: the gateway keeps airplanes for a pilot only. */
        val signedOut: Boolean = false,
        val airplanes: List<AircraftDto> = emptyList(),
        val editing: Editing? = null,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(loading = true, problem = null) }
        viewModelScope.launch {
            try {
                val got = list()
                _state.update { it.copy(loading = false, signedOut = got == null, airplanes = got.orEmpty()) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, problem = Problems.say("Your airplanes could not be fetched", e)) }
            }
        }
    }

    /** A new airplane's empty form. */
    fun startAdding() = _state.update { it.copy(editing = Editing(), problem = null) }

    /** A kept airplane's form, filled from its record. */
    fun startEditing(a: AircraftDto) = _state.update { it.copy(editing = Editing(id = a.id, form = AircraftForm.of(a)), problem = null) }

    fun change(how: (AircraftForm) -> AircraftForm) = _state.update { s ->
        s.copy(editing = s.editing?.let { e -> how(e.form).let { f -> e.copy(form = f, problems = if (e.tried) f.problems(rules) else emptyMap()) } })
    }

    /** The form put away, nothing saved. */
    fun close() = _state.update { it.copy(editing = null, problem = null) }

    /** The pilot's Save: refused in place, under each field, until the
     *  form is as the gateway takes it; then added or replaced. */
    fun save() {
        val e = _state.value.editing ?: return
        val problems = e.form.problems(rules)
        val request = e.form.request(problems)
        if (request == null) {
            _state.update { it.copy(editing = e.copy(tried = true, problems = problems)) }
            return
        }
        _state.update { it.copy(editing = e.copy(tried = true, problems = problems, saving = true), problem = null) }
        viewModelScope.launch {
            try {
                val saved = e.id?.let { update(it, request) } ?: add(request)
                _state.update { s ->
                    val kept = s.airplanes.filterNot { it.id == saved.id } + saved
                    s.copy(airplanes = kept.sortedBy { it.tailNumber }, editing = null)
                }
            } catch (x: CancellationException) {
                throw x
            } catch (x: Exception) {
                _state.update { s -> s.copy(editing = s.editing?.copy(saving = false), problem = Problems.say("The airplane could not be saved", x)) }
            }
        }
    }

    /** Delete asked or taken back; it is done only on [delete]. */
    fun confirmDelete(asking: Boolean) = _state.update { s -> s.copy(editing = s.editing?.copy(confirmingDelete = asking)) }

    /** The open airplane deleted at the gateway, with what is kept with it. */
    fun delete() {
        val e = _state.value.editing ?: return
        val id = e.id ?: return
        _state.update { it.copy(editing = e.copy(confirmingDelete = false, saving = true), problem = null) }
        viewModelScope.launch {
            try {
                delete(id)
                _state.update { s -> s.copy(airplanes = s.airplanes.filterNot { it.id == id }, editing = null) }
            } catch (x: CancellationException) {
                throw x
            } catch (x: Exception) {
                _state.update { s -> s.copy(editing = s.editing?.copy(saving = false), problem = Problems.say("The airplane could not be deleted", x)) }
            }
        }
    }
}
