package app.wingtipmaps.android.ai

import app.wingtipmaps.android.ai.functions.FunctionSchemaXml
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.FunctionArgValue
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.FunctionCallPart
import com.google.mlkit.genai.prompt.FunctionResponsePart
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.schema.tools.FunctionDeclaration
import com.google.mlkit.genai.schema.tools.FunctionSchema
import com.google.mlkit.genai.schema.tools.FunctionType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Gemini Nano through ML Kit's Prompt API (`com.google.mlkit:genai-prompt`),
 * in a build made with `-Pwingtip.genai=true` (build.gradle.kts): the only
 * file that touches ML Kit GenAI. Asked only through Nano, which asks
 * nothing while Settings' Extras has Ask off, so the client is not even
 * made until then.
 */
internal object NanoClient : NanoBackend {
    /** The client, made on first use: a phone without AICore throws here,
     *  which reads as UNAVAILABLE. */
    private val model: GenerativeModel? by lazy { runCatching { Generation.getClient() }.getOrNull() }

    override suspend fun status(): Nano.Status {
        val m = model ?: return Nano.Status.UNAVAILABLE
        return when (m.checkStatus()) {
            FeatureStatus.AVAILABLE -> Nano.Status.AVAILABLE
            FeatureStatus.DOWNLOADABLE -> Nano.Status.DOWNLOADABLE
            FeatureStatus.DOWNLOADING -> Nano.Status.DOWNLOADING
            else -> Nano.Status.UNAVAILABLE
        }
    }

    override fun download(): Flow<Nano.Status>? = model?.download()?.map { step ->
        when (step) {
            is DownloadStatus.DownloadCompleted -> Nano.Status.AVAILABLE
            is DownloadStatus.DownloadFailed -> Nano.Status.DOWNLOADABLE
            else -> Nano.Status.DOWNLOADING
        }
    }

    override suspend fun answer(system: String, prompt: String, maxTokens: Int, temperature: Float): String? {
        val m = model ?: return null
        val request = GenerateContentRequest.Builder(SystemInstruction(system), TextPart(prompt)).apply {
            maxOutputTokens = maxTokens
            this.temperature = temperature
        }.build()
        return m.generateContent(request).candidates.firstOrNull()?.text?.trim()?.takeIf { it.isNotEmpty() }
    }

    override suspend fun converse(
        system: String,
        turns: List<Nano.Turn>,
        tools: List<FunctionSchemaXml.Tool>,
        maxTokens: Int,
        temperature: Float,
        rounds: Int,
        onTool: (String) -> Unit,
        run: suspend (name: String, args: Map<String, Any?>) -> Map<String, Any?>,
    ): String? {
        val m = model ?: return null
        val declarations = tools.map(::declaration)
        val history = turns.map { t -> Content.Builder().role(if (t.user) Content.Role.USER else Content.Role.MODEL).text(t.text).build() }.toMutableList()
        repeat(rounds) {
            val request = GenerateContentRequest.Builder(history).apply {
                systemInstruction = SystemInstruction(system)
                maxOutputTokens = maxTokens
                this.temperature = temperature
            }.setTools(declarations).build()
            val said = m.generateContent(request).candidates.firstOrNull() ?: return null
            val calls = said.functionCalls
            if (calls.isEmpty()) return said.text.trim().takeIf { it.isNotEmpty() }
            history += Content.Builder().role(Content.Role.MODEL).apply { calls.forEach { addPart(FunctionCallPart(it)) } }.build()
            val answers = Content.Builder().role(Content.Role.USER)
            calls.forEach { call ->
                onTool(call.name)
                answers.addPart(FunctionResponsePart(call.id, call.name, run(call.name, call.arguments.mapValues { plain(it.value) })))
            }
            history += answers.build()
        }
        return null
    }

    /** The schema's tool as Nano's FunctionDeclaration. */
    private fun declaration(tool: FunctionSchemaXml.Tool): FunctionDeclaration {
        val properties = tool.params.associate { p -> p.name to schema(p) }
        val required = tool.params.filter { it.required }.map { it.name }
        return FunctionDeclaration(tool.name, tool.description, FunctionSchema(FunctionType.OBJECT, null, properties, required))
    }

    private fun schema(p: FunctionSchemaXml.Param): FunctionSchema = when (p.kind) {
        FunctionSchemaXml.Kind.STRING, FunctionSchemaXml.Kind.OTHER -> FunctionSchema(FunctionType.STRING, p.description)
        FunctionSchemaXml.Kind.INT, FunctionSchemaXml.Kind.LONG -> FunctionSchema(FunctionType.INTEGER, p.description)
        FunctionSchemaXml.Kind.DOUBLE -> FunctionSchema(FunctionType.NUMBER, p.description)
        FunctionSchemaXml.Kind.BOOLEAN -> FunctionSchema(FunctionType.BOOLEAN, p.description)
        FunctionSchemaXml.Kind.STRING_LIST -> FunctionSchema(
            FunctionType.ARRAY, p.description, null, null, null, null, null, FunctionSchema(FunctionType.STRING),
        )
    }

    /** A tool call's argument as a plain Kotlin value. */
    private fun plain(v: FunctionArgValue): Any = when (v) {
        is FunctionArgValue.StringValue -> v.value
        is FunctionArgValue.IntValue -> v.value
        is FunctionArgValue.LongValue -> v.value
        is FunctionArgValue.DoubleValue -> v.value
        is FunctionArgValue.BoolValue -> v.value
        is FunctionArgValue.ListValue -> v.values.map(::plain)
        is FunctionArgValue.MapValue -> v.map.mapValues { plain(it.value) }
    }
}
