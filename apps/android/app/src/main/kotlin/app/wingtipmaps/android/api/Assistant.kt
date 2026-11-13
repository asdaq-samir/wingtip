package app.wingtipmaps.android.api

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.ai.Nano
import app.wingtipmaps.android.ai.OnPhoneAsk
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
 * One line of an answer to Ask as Gemini Nano makes it on the phone
 * (ai/OnPhoneAsk): a "tool" line while it looks something up, "text"
 * lines that add to the answer, one "sources" line with the raw reports
 * the answer rests on, then "done" -- or a problem in the app's words.
 */
sealed interface AssistantLine {
    data class Tool(val name: String, val label: String) : AssistantLine

    data class Text(val text: String) : AssistantLine

    data class Sources(val sources: List<AssistantSource>) : AssistantLine

    data object Done : AssistantLine

    data class Problem(val words: String) : AssistantLine

    /** The answer is being made on the phone by Gemini Nano (ai/OnPhoneAsk);
     *  said under it. */
    data object OnPhone : AssistantLine
}

/** A raw thing an answer rests on (a METAR, a NOTAM), shown to the pilot
 *  as sent when its chip is tapped. */
data class AssistantSource(val id: String, val label: String, val text: String)

/** One turn of the conversation: the pilot's question, or the
 *  assistant's answer with the sources it cited and, where the stream
 *  broke, why. */
data class AssistantTurn(
    val id: Long,
    val role: Role,
    val content: String,
    val sources: List<AssistantSource> = emptyList(),
    val problem: String? = null,
    /** Made on the phone by Gemini Nano, nothing of it sent to a server. */
    val onPhone: Boolean = false,
) {
    enum class Role(val wire: String) { USER("user"), ASSISTANT("assistant") }
}

/** The pilot's plan, position and record, as OnPhoneAsk puts them in
 *  words for Gemini Nano. */
data class AssistantContext(
    val dep: String = "",
    val dest: String = "",
    val stops: List<String> = emptyList(),
    val aircraft: String = "",
    val altitudeFt: Double? = null,
    /** ISO 8601 UTC; null for now. */
    val depart: String? = null,
    val ownShip: OwnShipFix? = null,
    val pilot: PilotRecord? = null,
) {
    data class OwnShipFix(
        val lat: Double,
        val lon: Double,
        val altitudeFt: Double? = null,
        val trackDeg: Double? = null,
        val groundspeedKt: Double? = null,
    )

    /** The pilot's own, as words for the model to read, never to compute
     *  from: the home base here; the personal minimums and the currency
     *  once the Android app keeps them (the iOS app's Verdict). */
    data class PilotRecord(
        val personalMinimums: Map<String, Double>? = null,
        val currency: List<String> = emptyList(),
        val homeBase: String? = null,
    )
}

/**
 * The conversation as the pilot sees it, append-only: each streamed
 * answer becomes the next assistant turn, and the whole list is given
 * to the model with the next question. Pure, so a stream can be folded into it in a
 * test (AssistantTest).
 */
data class AssistantConversation(
    val turns: List<AssistantTurn> = emptyList(),
    /** What the assistant is doing right now (a tool's label), while it
     *  is answering; null between answers and once the text starts. */
    val status: String? = null,
    val answering: Boolean = false,
) {
    private val nextId: Long get() = (turns.lastOrNull()?.id ?: 0L) + 1

    /** The pilot's question, and the assistant's answer begun, empty. */
    fun ask(question: String): AssistantConversation = copy(
        turns = turns + AssistantTurn(nextId, AssistantTurn.Role.USER, question) +
            AssistantTurn(nextId + 1, AssistantTurn.Role.ASSISTANT, ""),
        status = null,
        answering = true,
    )

    /** One line of the stream folded into the answer being written. */
    fun take(line: AssistantLine): AssistantConversation {
        val last = turns.lastOrNull()?.takeIf { it.role == AssistantTurn.Role.ASSISTANT } ?: return this
        return when (line) {
            is AssistantLine.Tool -> copy(status = line.label)
            is AssistantLine.Text -> replacingLast(last.copy(content = last.content + line.text)).copy(status = null)
            is AssistantLine.Sources -> replacingLast(last.copy(sources = last.sources + line.sources))
            AssistantLine.Done -> copy(status = null, answering = false)
            is AssistantLine.Problem -> replacingLast(last.copy(problem = line.words)).copy(status = null, answering = false)
            AssistantLine.OnPhone -> replacingLast(last.copy(onPhone = true))
        }
    }

    /** The stream ended without its "done": the call failed, or was given
     *  up. What came stays; why is said under it. */
    fun broke(problem: String?): AssistantConversation {
        val last = turns.lastOrNull()?.takeIf { it.role == AssistantTurn.Role.ASSISTANT }
        val settled = copy(status = null, answering = false)
        return if (last != null && problem != null) settled.replacingLast(last.copy(problem = problem)) else settled
    }

    private fun replacingLast(turn: AssistantTurn) = copy(turns = turns.dropLast(1) + turn)

    /** The turns the model is given: every one with words (an answer cut
     *  off before its first word has none to give). */
    val messages: List<Assistant.Message>
        get() = turns.filter { it.content.isNotEmpty() }.map { Assistant.Message(it.role.wire, it.content) }
}

/** A turn as the model is given it. */
object Assistant {
    data class Message(val role: String, val content: String)

    /** What Ask says on a phone without Gemini Nano, where it is asked
     *  anyway (AiOffered hides it first). */
    const val NO_MODEL = "Ask needs Gemini Nano on this phone."
}

/**
 * The conversation on the phone, one question at a time: a new one
 * cancels the stream of the last, whose words so far stay on the page.
 * A ViewModel, as Plan and Session are, with the conversation in a flow
 * for AskScreen to draw.
 */
@HiltViewModel
class AssistantClient @Inject constructor() : ViewModel() {
    private val _conversation = MutableStateFlow(AssistantConversation())
    val conversation: StateFlow<AssistantConversation> = _conversation.asStateFlow()

    private var running: Job? = null

    fun ask(question: String, context: AssistantContext?) {
        val words = question.trim()
        if (words.isEmpty()) return
        cancel()
        _conversation.update { it.ask(words) }
        val messages = _conversation.value.messages
        running = viewModelScope.launch {
            try {
                // Gemini Nano with the app's own tools (docs/android-ai.md):
                // the only model Ask has since the server's Claude features
                // were taken out (decision 0041).
                if (!Nano.ready()) {
                    _conversation.update { it.broke(Assistant.NO_MODEL) }
                    return@launch
                }
                OnPhoneAsk.stream(messages, context).collect { line -> _conversation.update { it.take(line) } }
                // A stream that ends with no "done" is cut off; the words so
                // far stay, and the pilot is told the answer is short.
                if (_conversation.value.answering) _conversation.update { it.broke("The answer was cut off.") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _conversation.update { it.broke(e.message ?: "No answer could be given.") }
            }
        }
    }

    /** The stream of the last question given up: what came stays. */
    fun cancel() {
        running?.cancel()
        running = null
        if (_conversation.value.answering) _conversation.update { it.broke(null) }
    }

    fun clear() {
        cancel()
        _conversation.value = AssistantConversation()
    }
}
