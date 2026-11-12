package app.wingtipmaps.android.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.assistant.Context
import app.wingtipmaps.android.api.generated.assistant.Source
import app.wingtipmaps.android.api.generated.assistant.TripAsk
import app.wingtipmaps.android.api.generated.assistant.TripLeg
import app.wingtipmaps.android.api.generated.assistant.TripMessage
import app.wingtipmaps.android.api.generated.assistant.TripProposal
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.ZoneId
import javax.inject.Inject

/**
 * The trip planner, as the web's (features/tripPlanner) has it: a trip in
 * the pilot's own words ("VFR to Oshkosh Saturday morning, stay out of
 * the Chicago Class B, back by 5") sent to the assistant's POST
 * /api/trip-plan (the gateway's /api/planner proxy) with the plan the app
 * has and this phone's time zone, its stream read as it comes: the tool
 * in use as a passing line, the reason, then the proposal and its
 * sources. Every figure in it is the planner's; nothing is applied until
 * the pilot taps Use.
 */
data class TripState(
    val asked: String = "",
    val status: String? = null,
    val words: String = "",
    val proposal: TripProposal? = null,
    val sources: List<Source> = emptyList(),
    val error: String? = null,
    val busy: Boolean = false,
    /** The legs loaded, by kind. */
    val used: List<String> = emptyList(),
) {
    /** One line of the stream folded in (the web's step). */
    fun take(m: TripMessage): TripState = when (m.type) {
        "tool" -> copy(status = m.label)
        "text" -> copy(status = null, words = words + (m.text ?: ""))
        "plan" -> copy(proposal = m.proposal)
        "sources" -> copy(sources = m.sources.orEmpty())
        "error" -> copy(status = null, error = m.words, busy = false)
        else -> copy(status = null, busy = false)
    }
}

object TripPlan {
    /** The web's words where the call itself fails. */
    const val SIGN_IN = "Sign in to plan a trip"
    const val UNREACHABLE = "The trip planner cannot be reached"

    fun stream(ask: TripAsk): Flow<TripMessage> = flow {
        // Claude's alone, with no model on the phone: never asked while the
        // Claude features are off (ClaudeGate), and Ask hides its chip then.
        ClaudeGate.require()
        val body = Gateway.json.encodeToString(ask).toRequestBody("application/json".toMediaType())
        val builder = Request.Builder().url(Config.gateway + Config.plannerPath("/api/trip-plan"))
            .header("Accept", "application/x-ndjson").post(body)
        Gateway.csrfToken?.let { builder.header("X-XSRF-TOKEN", it) }
        Gateway.streaming.newCall(builder.build()).execute().use { response ->
            if (response.code != 200) throw Planner.Failure(response.code, Planner.detail(response.body.string()))
            val source = response.body.source()
            while (true) {
                val line = source.readUtf8Line() ?: break
                if (line.isEmpty()) continue
                val message = Gateway.json.decodeFromString<TripMessage>(line)
                emit(message)
                if (message.type == "done" || message.type == "error") break
            }
        }
    }.flowOn(Dispatchers.IO)

    fun words(e: Exception): String = when {
        e is ClaudeGate.Off -> e.message.orEmpty()
        e is Planner.Failure && e.status == 401 -> SIGN_IN
        e is Planner.Failure -> e.message ?: UNREACHABLE
        e is IOException -> Problems.say(UNREACHABLE, e)
        else -> e.message ?: UNREACHABLE
    }
}

/** The trip planner's one view model: one trip at a time, a new one
 *  giving up the last's stream. */
@HiltViewModel
class TripPlannerModel @Inject constructor() : ViewModel() {
    private val _state = MutableStateFlow(TripState())
    val state: StateFlow<TripState> = _state.asStateFlow()
    private var running: Job? = null

    /** `context` is the plan as the Ask sends it: no airplane picked is
     *  "", the rules the assistant's own default. */
    fun plan(text: String, context: Context) {
        val asked = text.trim()
        if (asked.isEmpty()) return
        stop()
        _state.value = TripState(asked = asked, busy = true, status = "Reading the trip")
        val ask = TripAsk(context = context, text = asked, timeZone = ZoneId.systemDefault().id)
        running = viewModelScope.launch {
            try {
                TripPlan.stream(ask).collect { m -> _state.update { it.take(m) } }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(error = TripPlan.words(e)) }
            }
            _state.update { it.copy(busy = false, status = null) }
        }
    }

    fun used(leg: TripLeg) = _state.update { it.copy(used = it.used + leg.kind) }

    fun stop() {
        running?.cancel()
        running = null
        _state.update { it.copy(busy = false, status = null) }
    }

    fun clear() {
        stop()
        _state.value = TripState()
    }
}
