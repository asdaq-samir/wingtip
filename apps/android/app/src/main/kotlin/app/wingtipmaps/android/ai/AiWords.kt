package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.Assistant
import app.wingtipmaps.android.api.AssistantLine
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.Gateway

/**
 * A screen's figures put in words, on the phone first (docs/android-ai.md):
 * Gemini Nano where this phone has it, so nothing leaves the phone; else
 * Wingtip's assistant on the server (Claude, POST /api/assistant) for a
 * pilot signed in; else nothing, and the screen shows its figures as it
 * always has. Either way the words pass FigureGuard: a sentence with a
 * figure the sources do not give is dropped.
 */
object AiWords {
    enum class Where { PHONE, SERVER }

    data class Answer(val text: String, val where: Where, val dropped: Int, val sources: List<AssistantSource>)

    /** Whether words can be offered here at all: Nano on the phone, or a
     *  session the assistant may answer for. */
    suspend fun offered(): Boolean = Nano.ready() || Gateway.csrfToken != null

    suspend fun say(task: AiTask, sources: List<AssistantSource>): Answer? {
        if (sources.isEmpty()) return null
        val prompt = prompt(task, sources)
        val texts = sources.map { "${it.label} ${it.text}" }
        if (Nano.ready()) {
            val words = Nano.answer(AiTask.RULES, prompt, task.maxTokens) ?: return null
            return answer(words, Where.PHONE, texts, sources)
        }
        if (Gateway.csrfToken == null) return null
        val said = StringBuilder()
        val cited = mutableListOf<AssistantSource>()
        Assistant.stream(Assistant.Ask(listOf(Assistant.Message("user", "${AiTask.RULES}\n\n$prompt")))).collect { line ->
            when (line) {
                is AssistantLine.Text -> said.append(line.text)
                is AssistantLine.Sources -> cited += line.sources
                is AssistantLine.Problem -> throw IllegalStateException(line.words)
                else -> {}
            }
        }
        return answer(said.toString(), Where.SERVER, texts + cited.map { "${it.label} ${it.text}" }, sources + cited)
    }

    /** The task's ask with its sources, each by its id, as the model reads them. */
    fun prompt(task: AiTask, sources: List<AssistantSource>): String =
        task.ask + "\n\nSources:\n" + sources.joinToString("\n") { "[${it.id}] ${it.label}: ${it.text}" }

    private fun answer(words: String, where: Where, texts: List<String>, sources: List<AssistantSource>): Answer? {
        val kept = FigureGuard.keep(words, texts)
        return kept.text.takeIf { it.isNotBlank() }?.let { Answer(it, where, kept.dropped, sources) }
    }
}
