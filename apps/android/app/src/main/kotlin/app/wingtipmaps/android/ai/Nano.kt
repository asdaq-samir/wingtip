package app.wingtipmaps.android.ai

import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.Extras
import app.wingtipmaps.android.ai.functions.FunctionSchemaXml
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What Gemini Nano is asked through: ML Kit's Prompt API over Android's
 * AICore where the build has it (`-Pwingtip.genai=true`, src/genai), else
 * nothing at all (src/nogenai, the first store build's: ML Kit GenAI
 * sends Google device identifiers, the feature review).
 */
internal interface NanoBackend {
    /** Whether Nano is on this phone; UNAVAILABLE where AICore is not. */
    suspend fun status(): Nano.Status

    /** AICore's download, each step as a status; null where there is no model to fetch. */
    fun download(): Flow<Nano.Status>?

    suspend fun answer(system: String, prompt: String, maxTokens: Int, temperature: Float): String?

    /** A conversation answered with tools, `rounds` at most (Nano.converse). */
    suspend fun converse(
        system: String,
        turns: List<Nano.Turn>,
        tools: List<FunctionSchemaXml.Tool>,
        maxTokens: Int,
        temperature: Float,
        rounds: Int,
        onTool: (String) -> Unit,
        run: suspend (name: String, args: Map<String, Any?>) -> Map<String, Any?>,
    ): String?
}

/**
 * Gemini Nano on the phone, through ML Kit's Prompt API over Android's
 * AICore (docs/android-ai.md): whether this phone has it, its download,
 * and an answer to a prompt -- with tools, for Ask -- that never leaves
 * the phone. A phone without it (most phones before 2025's flagships)
 * says UNAVAILABLE, and the app then has no AI words at all (the
 * server's Claude features were taken out, decision 0041); nothing else
 * changes. Parked in Settings' Extras (Ask, off to start): while it is
 * off nothing of ML Kit is made or asked, and every feature that needs a
 * model reads as on a phone without one.
 */
object Nano {
    enum class Status { UNKNOWN, UNAVAILABLE, DOWNLOADABLE, DOWNLOADING, AVAILABLE }

    /** One turn of a conversation: the pilot's, or the model's. */
    data class Turn(val user: Boolean, val text: String)

    /** How many rounds of tool calls an answer may take before it is
     *  given up: an answer is a look-up or two, not a search. */
    const val MAX_TOOL_ROUNDS = 4

    private val _status = MutableStateFlow(Status.UNKNOWN)
    val status: StateFlow<Status> = _status.asStateFlow()

    /** Whether Settings' Extras has Ask off: then AICore is never asked. */
    fun parked(): Boolean = !Extras.now(Extra.ASK)

    /** Whether Nano is here, asked of AICore once and kept; UNAVAILABLE,
     *  unasked and not kept, while Ask is parked. */
    suspend fun check(): Status {
        if (parked()) return Status.UNAVAILABLE
        val now = try {
            NanoClient.status()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Status.UNAVAILABLE
        }
        _status.value = now
        return now
    }

    suspend fun ready(): Boolean = !parked() && (status.value.takeIf { it != Status.UNKNOWN } ?: check()) == Status.AVAILABLE

    /** The model fetched by AICore, on the pilot's say (Setup's On-Phone
     *  AI): Google's download, over Wi-Fi or not as AICore decides. */
    suspend fun download() {
        if (parked()) return
        val steps = NanoClient.download() ?: return
        _status.value = Status.DOWNLOADING
        steps.collect { _status.value = it }
    }

    /** One answer to one prompt, under the app's instructions; null where
     *  Nano gave nothing. */
    suspend fun answer(system: String, prompt: String, maxTokens: Int): String? =
        if (parked()) null else NanoClient.answer(system, prompt, maxTokens, TEMPERATURE)

    /**
     * A conversation answered with tools: each round, Nano either answers
     * in words or asks for tools, which `run` answers (the app's own
     * actions, AgentTools) and which go back to it for the next round,
     * up to MAX_TOOL_ROUNDS. `onTool` hears each tool's name as it is
     * asked, for the "Looking up…" line under the question.
     */
    suspend fun converse(
        system: String,
        turns: List<Turn>,
        tools: List<FunctionSchemaXml.Tool>,
        maxTokens: Int,
        onTool: (String) -> Unit,
        run: suspend (name: String, args: Map<String, Any?>) -> Map<String, Any?>,
    ): String? = if (parked()) null else NanoClient.converse(system, turns, tools, maxTokens, TEMPERATURE, MAX_TOOL_ROUNDS, onTool, run)

    /** Low, so the words stay close to the sources they are given. */
    private const val TEMPERATURE = 0.2f
}
