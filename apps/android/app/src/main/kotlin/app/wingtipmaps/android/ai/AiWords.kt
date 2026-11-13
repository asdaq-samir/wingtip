package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.AssistantSource

/**
 * A screen's figures put in words on the phone (docs/android-ai.md):
 * Gemini Nano where this phone has it, so nothing leaves the phone; else
 * nothing, and the screen shows its figures as it always has. The words
 * pass FigureGuard: a sentence with a figure the sources do not give is
 * dropped.
 */
object AiWords {
    data class Answer(val text: String, val dropped: Int, val sources: List<AssistantSource>)

    /** Whether words can be offered here at all: Nano on the phone. */
    suspend fun offered(): Boolean = Nano.ready()

    suspend fun say(task: AiTask, sources: List<AssistantSource>): Answer? {
        if (sources.isEmpty() || !Nano.ready()) return null
        val words = Nano.answer(AiTask.RULES, prompt(task, sources), task.maxTokens) ?: return null
        val kept = FigureGuard.keep(words, sources.map { "${it.label} ${it.text}" })
        return kept.text.takeIf { it.isNotBlank() }?.let { Answer(it, kept.dropped, sources) }
    }

    /** The task's ask with its sources, each by its id, as the model reads them. */
    fun prompt(task: AiTask, sources: List<AssistantSource>): String =
        task.ask + "\n\nSources:\n" + sources.joinToString("\n") { "[${it.id}] ${it.label}: ${it.text}" }
}
