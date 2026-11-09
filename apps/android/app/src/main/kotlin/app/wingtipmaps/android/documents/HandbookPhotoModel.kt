package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.addAircraft
import app.wingtipmaps.android.api.aircraft
import app.wingtipmaps.android.api.generated.assistant.DocumentRead
import app.wingtipmaps.android.api.generated.assistant.HandbookCheck
import app.wingtipmaps.android.api.generated.assistant.HandbookRead
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
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
) : ViewModel() {
    /** The airplane's figures as typed, each a field's text. */
    data class Form(
        val tail: String = "",
        val type: String = "",
        val cruiseTas: String = "",
        val burn: String = "",
        val power: String = "",
        val climbBurn: String = "",
        val usableFuel: String = "",
    )

    data class State(
        val page: Documents.Kind = Documents.Kind.PERFORMANCE,
        val reading: Boolean = false,
        val problem: String? = null,
        val answer: DocumentRead? = null,
        val confirmed: Set<String> = emptySet(),
        /** The engine's check of the confirmed items alone: what is kept. */
        val kept: HandbookCheck? = null,
        val form: Form = Form(),
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
                val p = kept.profile
                fun pick(v: Double?, was: String) = v?.let(HandbookReview::tenth) ?: was
                val f = s.form
                _state.update {
                    it.copy(
                        kept = kept, problem = null,
                        form = f.copy(
                            tail = f.tail.ifEmpty { tail.orEmpty() },
                            type = f.type.ifEmpty { type.uppercase() },
                            cruiseTas = pick(p.cruiseTasKt, f.cruiseTas),
                            burn = pick(p.fuelBurnGph, f.burn),
                            power = pick(p.cruisePowerPct, f.power),
                            climbBurn = pick(p.climbFuelBurnGph, f.climbBurn),
                            usableFuel = pick(p.usableFuelGal, f.usableFuel),
                        ),
                    )
                }
            },
            onFailure = { e -> _state.update { it.copy(problem = "The confirmed figures could not be checked: ${e.message}") } },
        )
    }

    fun edit(how: (Form) -> Form) = _state.update { it.copy(form = how(it.form), saved = false) }

    /** Back to the items, to confirm another or take one back. */
    fun review() = _state.update { it.copy(kept = null, saved = false) }

    /** The airplane's figures as the gateway takes them, or null until the
     *  registration, the type, the cruise speed and the burn are given. */
    fun request(form: Form, was: AircraftDto?): AircraftRequest? {
        val tas = form.cruiseTas.toDoubleOrNull() ?: return null
        val burn = form.burn.toDoubleOrNull() ?: return null
        val tail = form.tail.trim().uppercase().ifEmpty { return null }
        val type = form.type.trim().uppercase().ifEmpty { return null }
        return AircraftRequest(
            tailNumber = tail, typeDesignator = type, cruiseTasKt = tas, fuelBurnGph = burn,
            cruisePowerPct = form.power.toDoubleOrNull(),
            climbFuelBurnGph = form.climbBurn.toDoubleOrNull() ?: was?.climbFuelBurnGph,
            climbTasKt = was?.climbTasKt,
            usableFuelGal = form.usableFuel.toDoubleOrNull() ?: was?.usableFuelGal,
            // Kept as the pilot set them on the web: not on this page.
            colour = was?.colour, equipment = was?.equipment, surveillance = was?.surveillance,
        )
    }

    /** The pilot's Save: the airplane by its registration replaced or
     *  added, then, once that is saved, its handbook figures. */
    fun save() {
        val s = _state.value
        val kept = s.kept ?: return
        if (request(s.form, null) == null) return
        _state.update { it.copy(saving = true, problem = null) }
        viewModelScope.launch {
            try {
                val tail = s.form.tail.trim().uppercase()
                val was = Gateway.aircraft().orEmpty().firstOrNull { it.tailNumber.equals(tail, ignoreCase = true) }
                val ask = checkNotNull(request(s.form, was))
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
