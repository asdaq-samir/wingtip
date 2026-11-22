package app.wingtipmaps.android.ai

import app.wingtipmaps.android.ai.functions.FunctionSchemaXml
import kotlinx.coroutines.flow.Flow

/**
 * No Gemini Nano: the build without ML Kit GenAI (the default, and the
 * first store build's; the feature review drops `genai-prompt`, which
 * sends Google device identifiers). Every phone reads as one without
 * Nano, as most phones are, and the app has no AI words; Ask is parked
 * in Settings' Extras besides. `-Pwingtip.genai=true` builds src/genai's
 * instead.
 */
internal object NanoClient : NanoBackend {
    override suspend fun status(): Nano.Status = Nano.Status.UNAVAILABLE

    override fun download(): Flow<Nano.Status>? = null

    override suspend fun answer(system: String, prompt: String, maxTokens: Int, temperature: Float): String? = null

    override suspend fun converse(
        system: String,
        turns: List<Nano.Turn>,
        tools: List<FunctionSchemaXml.Tool>,
        maxTokens: Int,
        temperature: Float,
        rounds: Int,
        onTool: (String) -> Unit,
        run: suspend (name: String, args: Map<String, Any?>) -> Map<String, Any?>,
    ): String? = null
}
