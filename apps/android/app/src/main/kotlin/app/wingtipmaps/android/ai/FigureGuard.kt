package app.wingtipmaps.android.ai

import java.math.BigDecimal

/**
 * The rule that AI never decides a figure, held on the phone: a sentence
 * the model wrote is kept only where every number in it is one the
 * sources gave (the engine's, the planner's, the FAA's report as sent, or
 * the pilot's own question). A sentence with a number of the model's own
 * -- a crosswind it worked out, a distance it guessed -- is dropped, and
 * the answer says how many were. Pure, for a unit test (FigureGuardTest).
 */
object FigureGuard {
    data class Kept(val text: String, val dropped: Int)

    private val NUMBER = Regex("""\d[\d,]*(?:\.\d+)?""")
    private val SENTENCE = Regex("""(?<=[.!?])\s+""")

    /** The numbers in some text, written one way: "1,200" and "1200.0" alike. */
    fun numbers(text: String): Set<String> =
        NUMBER.findAll(text).mapNotNull { m ->
            runCatching { BigDecimal(m.value.replace(",", "")).stripTrailingZeros().toPlainString() }.getOrNull()
        }.toSet()

    /** The model's words with only the sentences whose figures are all in `sources`. */
    fun keep(words: String, sources: List<String>): Kept {
        val allowed = sources.flatMap { numbers(it) }.toSet()
        val sentences = words.trim().split(SENTENCE).filter { it.isNotBlank() }
        val kept = sentences.filter { numbers(it).all { n -> n in allowed } }
        return Kept(kept.joinToString(" "), sentences.size - kept.size)
    }
}
