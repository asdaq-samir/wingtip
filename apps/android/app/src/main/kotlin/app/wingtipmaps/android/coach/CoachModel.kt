package app.wingtipmaps.android.coach

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.CoachAsk
import app.wingtipmaps.android.api.generated.CoachDebrief
import app.wingtipmaps.android.api.generated.CoachEndorsement
import app.wingtipmaps.android.api.generated.CoachLogbookEntry
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.api.generated.assistant.CoachWordsAnswer
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.TrainingDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Clock
import kotlin.time.toJavaInstant

/** What the pilot holds, as the plan reads it: a student is held to the
 *  solo endorsement (14 CFR 61.56(g), 61.87(n), (p)); an instrument
 *  rating adds 61.57(c). Which rules follow is the engine's. */
enum class Certificate(val wire: String, val ratings: List<String>) {
    STUDENT("student", listOf("student")),
    PRIVATE("private", listOf("private")),
    INSTRUMENT("instrument", listOf("private", "instrument"));

    companion object {
        fun of(wire: String?): Certificate? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * The Coach's view model (the web's useCoach): the pilot's logbook, dates,
 * training record and home field as the gateway keeps them, the
 * certificate they hold (a menu, kept on this phone), and on their ask the
 * engine's plan through the planner, then the plan in words from the
 * assistant. The plan is the engine's; the words come after it and never
 * hold it up, so a plan shows whether or not they come.
 */
@HiltViewModel(assistedFactory = CoachModel.Factory::class)
class CoachModel(
    private val source: CoachSource = ServerCoach,
    private val keeper: CertificateKeeper,
    private val today: () -> LocalDate = { AppClock.today() },
) : ViewModel() {
    /** Hilt's, the certificate's keeping handed in by the screen: the
     *  server's sources and today by the app's clock. */
    @AssistedInject
    constructor(source: CoachSource, @Assisted keeper: CertificateKeeper, clock: Clock) :
        this(source, keeper, { clock.now().toJavaInstant().atZone(ZoneId.systemDefault()).toLocalDate() })

    @AssistedFactory
    interface Factory {
        fun create(keeper: CertificateKeeper): CoachModel
    }

    data class State(
        /** The logbook has been read, so a plan can be asked for. */
        val ready: Boolean = false,
        val certificate: Certificate = Certificate.PRIVATE,
        val home: String? = null,
        val making: Boolean = false,
        val problem: String? = null,
        val plan: ProficiencyPlan? = null,
        val words: CoachWordsAnswer? = null,
        val wording: Boolean = false,
        /** Why there are no words, where the assistant could not be asked. */
        val noWords: String? = null,
    )

    /** The certificate the pilot picked; until then the guess stands. */
    private var chosen: Certificate? = keeper.read()
    private var entries: List<LogbookEntryDto> = emptyList()
    private var currency: CurrencyDto? = null
    private var training: TrainingDto? = null
    private var making: Job? = null

    private val _state = MutableStateFlow(State(certificate = chosen ?: Certificate.PRIVATE))
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        try {
            val read = source.entries()
            if (read == null) {
                _state.update { it.copy(problem = "Sign in for your plan.") }
                return
            }
            entries = read
            currency = source.currency()
            // The training record is a student's endorsements only: a pilot
            // without one is asked their plan all the same.
            training = quietly { source.training() }
            val home = quietly { source.home() }
            _state.update { it.copy(ready = true, home = home, certificate = chosen ?: guessed(entries, currency, training)) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(problem = Problems.say("Your logbook could not be fetched", e)) }
        }
    }

    fun choose(certificate: Certificate) {
        chosen = certificate
        keeper.keep(certificate)
        _state.update { it.copy(certificate = certificate) }
    }

    /** The plan asked for again, and its words after it. */
    fun make() {
        val s = _state.value
        if (!s.ready || s.making) return
        making?.cancel()
        making = viewModelScope.launch {
            _state.update { it.copy(making = true, problem = null, plan = null, words = null, noWords = null) }
            val ask = askOf(entries, currency, training, s.certificate, s.home, today().toString(), source.debriefs())
            val plan = try {
                source.plan(ask)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(making = false, problem = said(e, "Your plan could not be made")) }
                return@launch
            }
            // The words are Claude's: while the Claude features are off
            // (ClaudeGate) the engine's plan stands alone, nothing promised.
            if (!source.wordsOffered()) {
                _state.update { it.copy(making = false, plan = plan) }
                return@launch
            }
            _state.update { it.copy(making = false, plan = plan, wording = true) }
            try {
                val words = source.words(plan)
                _state.update { it.copy(wording = false, words = words, noWords = words.unavailable.takeIf { words.sentences.isEmpty() }) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(wording = false, noWords = said(e, "The assistant could not be reached")) }
            }
        }
    }

    companion object {
        /** The plan's ask from what the app holds, as the web's askOf: the
         *  logbook's columns the currency rules read, the dates as the
         *  gateway gives them, a student's endorsements, and the saved
         *  flights' debriefs (CoachDebriefs). */
        fun askOf(
            entries: List<LogbookEntryDto>, currency: CurrencyDto?, training: TrainingDto?, certificate: Certificate,
            home: String?, today: String, debriefs: List<CoachDebrief> = emptyList(),
        ): CoachAsk = CoachAsk(
            entries = entries.map(::entryOf),
            flightReviewOn = currency?.flightReviewOn,
            medicalExpiresOn = currency?.medicalExpiresOn,
            ipcOn = currency?.ipcOn,
            ratings = certificate.ratings,
            held = if (certificate == Certificate.STUDENT) training?.endorsements.orEmpty().map { CoachEndorsement(code = it.code, on = it.endorsedOn) } else emptyList(),
            debriefs = debriefs,
            home = home,
            today = today,
        )

        fun entryOf(e: LogbookEntryDto) = CoachLogbookEntry(
            flownOn = e.flownOn, totalHours = e.totalHours, nightHours = e.nightHours, crossCountryHours = e.crossCountryHours,
            dayLandings = e.dayLandings, nightLandings = e.nightLandings, dualHours = e.dualHours, soloHours = e.soloHours,
            instrumentHours = e.instrumentHours, approaches = e.approaches, holding = e.holding, tracking = e.tracking,
        )

        /** The certificate a pilot most likely holds, until they say, as
         *  the web guesses: a student with endorsements on file,
         *  instrument where a check or an approach is logged, else private. */
        fun guessed(entries: List<LogbookEntryDto>, currency: CurrencyDto?, training: TrainingDto?): Certificate = when {
            training?.endorsements.orEmpty().isNotEmpty() -> Certificate.STUDENT
            currency?.ipcOn != null || entries.any { it.approaches > 0 } -> Certificate.INSTRUMENT
            else -> Certificate.PRIVATE
        }

        /** A failed call in the server's words where it gave any, and a
         *  sign-in's ask where the session is gone. */
        fun said(e: Exception, what: String): String = when {
            e is Gateway.Refusal && e.status == 401 -> "Sign in for your plan."
            else -> Problems.say(what, e)
        }

        private suspend fun <T> quietly(read: suspend () -> T?): T? = try {
            read()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }
}
