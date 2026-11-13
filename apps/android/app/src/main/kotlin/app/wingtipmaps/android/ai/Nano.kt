package app.wingtipmaps.android.ai

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.FunctionCall
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.FunctionCallPart
import com.google.mlkit.genai.prompt.FunctionResponsePart
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.schema.tools.FunctionDeclaration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Gemini Nano on the phone, through ML Kit's Prompt API over Android's
 * AICore (docs/android-ai.md): whether this phone has it, its download,
 * and an answer to a prompt -- with tools, for Ask -- that never leaves
 * the phone. A phone without it (most phones before 2025's flagships)
 * says UNAVAILABLE, and the app then has no AI words at all (the
 * server's Claude features were taken out, decision 0041); nothing else
 * changes.
 */
object Nano {
    enum class Status { UNKNOWN, UNAVAILABLE, DOWNLOADABLE, DOWNLOADING, AVAILABLE }

    /** How many rounds of tool calls an answer may take before it is
     *  given up: an answer is a look-up or two, not a search. */
    const val MAX_TOOL_ROUNDS = 4

    private val _status = MutableStateFlow(Status.UNKNOWN)
    val status: StateFlow<Status> = _status.asStateFlow()

    /** The client, made on first use: a phone without AICore throws here,
     *  which reads as UNAVAILABLE. */
    private val model: GenerativeModel? by lazy { runCatching { Generation.getClient() }.getOrNull() }

    fun of(code: Int): Status = when (code) {
        FeatureStatus.AVAILABLE -> Status.AVAILABLE
        FeatureStatus.DOWNLOADABLE -> Status.DOWNLOADABLE
        FeatureStatus.DOWNLOADING -> Status.DOWNLOADING
        else -> Status.UNAVAILABLE
    }

    /** Whether Nano is here, asked of AICore once and kept. */
    suspend fun check(): Status {
        val m = model ?: return Status.UNAVAILABLE.also { _status.value = it }
        val now = try {
            of(m.checkStatus())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Status.UNAVAILABLE
        }
        _status.value = now
        return now
    }

    suspend fun ready(): Boolean = (status.value.takeIf { it != Status.UNKNOWN } ?: check()) == Status.AVAILABLE

    /** The model fetched by AICore, on the pilot's say (Setup's On-Phone
     *  AI): Google's download, over Wi-Fi or not as AICore decides. */
    suspend fun download() {
        val m = model ?: return
        _status.value = Status.DOWNLOADING
        m.download().collect { step ->
            _status.value = when (step) {
                is DownloadStatus.DownloadCompleted -> Status.AVAILABLE
                is DownloadStatus.DownloadFailed -> Status.DOWNLOADABLE
                else -> Status.DOWNLOADING
            }
        }
    }

    /** One answer to one prompt, under the app's instructions; null where
     *  Nano gave nothing. */
    suspend fun answer(system: String, prompt: String, maxTokens: Int): String? {
        val m = model ?: return null
        val request = GenerateContentRequest.Builder(SystemInstruction(system), TextPart(prompt)).apply {
            maxOutputTokens = maxTokens
            temperature = TEMPERATURE
        }.build()
        return m.generateContent(request).candidates.firstOrNull()?.text?.trim()?.takeIf { it.isNotEmpty() }
    }

    /**
     * A conversation answered with tools: each round, Nano either answers
     * in words or asks for tools, which `run` answers (the app's own
     * actions, AgentTools) and which go back to it for the next round,
     * up to MAX_TOOL_ROUNDS. `onTool` hears each tool's name as it is
     * asked, for the "Looking up…" line under the question.
     */
    suspend fun converse(
        system: String,
        turns: List<Content>,
        tools: List<FunctionDeclaration>,
        maxTokens: Int,
        onTool: (String) -> Unit,
        run: suspend (FunctionCall) -> Map<String, Any?>,
    ): String? {
        val m = model ?: return null
        val history = turns.toMutableList()
        repeat(MAX_TOOL_ROUNDS) {
            val request = GenerateContentRequest.Builder(history).apply {
                systemInstruction = SystemInstruction(system)
                maxOutputTokens = maxTokens
                temperature = TEMPERATURE
            }.setTools(tools).build()
            val said = m.generateContent(request).candidates.firstOrNull() ?: return null
            val calls = said.functionCalls
            if (calls.isEmpty()) return said.text.trim().takeIf { it.isNotEmpty() }
            history += Content.Builder().role(Content.Role.MODEL).apply { calls.forEach { addPart(FunctionCallPart(it)) } }.build()
            val answers = Content.Builder().role(Content.Role.USER)
            calls.forEach { call ->
                onTool(call.name)
                answers.addPart(FunctionResponsePart(call.id, call.name, run(call)))
            }
            history += answers.build()
        }
        return null
    }

    /** Low, so the words stay close to the sources they are given. */
    private const val TEMPERATURE = 0.2f
}
