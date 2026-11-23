package app.wingtipmaps.android.library

import app.wingtipmaps.android.api.generated.CfrText
import kotlinx.serialization.Serializable

/** An outline row: its title, the page it opens (from 1) and its depth
 *  for its indent. */
@Serializable
data class OutlineRow(val title: String, val page: Int, val depth: Int)

/** A place a search found: a PDF's page (from 1) or a CFR part's section
 *  and its paragraph (-1 its heading), and the words round the match. */
data class Hit(val page: Int? = null, val section: String? = null, val paragraph: Int = -1, val before: String, val match: String, val after: String)

/**
 * How the reader finds its way, apart from PdfBox and the screens so it
 * is tested on its own, as the web's pdfPlaces.ts and textSearch.ts are:
 * a paragraph's row in the outline, and every place a search finds in a
 * PDF's pages or a CFR part's sections.
 */
object Finding {
    /** Words either side of a match in its row. */
    private const val AROUND = 40

    /** The most results listed: past that the pilot types more. */
    const val MOST_HITS = 200

    /** The dashes a PDF's text may set a paragraph's number in (the AIM's
     *  "7–1–5") as the hyphen the engine's citations write. */
    fun plainDashes(text: String): String = text.replace(Regex("[‐-―−]"), "-")

    /** The outline's row for a paragraph or section ("7-1-5", "91.155"):
     *  the first whose title starts with it and a word after it, not a
     *  longer number ("7-1-50"). */
    fun rowFor(rows: List<OutlineRow>, at: String): OutlineRow? {
        val wanted = plainDashes(at)
        return rows.firstOrNull { r ->
            val title = plainDashes(r.title.trim()).replace(Regex("^(paragraph|section|§)\\s*", RegexOption.IGNORE_CASE), "")
            title.startsWith(wanted) && title.getOrNull(wanted.length)?.isDigit() != true
        }
    }

    /** The outline's title for a page: the last row at or before it, so a
     *  bookmark is named by the section it is in. */
    fun titleAt(rows: List<OutlineRow>, page: Int): String? = rows.lastOrNull { it.page <= page }?.title?.ifEmpty { null }

    /** What the search looks for where the outline has no row for a
     *  paragraph: its number as a heading sets it, with its stop. */
    fun headingWords(at: String): String = "$at."

    /** Every place `query` is in a PDF's pages' text, in order, its case
     *  aside. */
    fun inPages(pages: List<String>, query: String): List<Hit> {
        val wanted = plainDashes(query.trim()).lowercase()
        if (wanted.length < 2) return emptyList()
        val hits = mutableListOf<Hit>()
        pages.forEachIndexed { i, text -> around(plainDashes(text), wanted, hits) { b, m, a -> Hit(page = i + 1, before = b, match = m, after = a) } }
        return hits
    }

    /** Every place `query` is in a CFR part, a section's number and
     *  heading counted as its text. */
    fun inPart(text: CfrText, query: String): List<Hit> {
        val wanted = query.trim().lowercase()
        if (wanted.length < 2) return emptyList()
        val hits = mutableListOf<Hit>()
        for (group in text.groups) {
            for (section in group.sections) {
                (listOf(section.head) + section.paragraphs).forEachIndexed { i, line ->
                    around(line, wanted, hits) { b, m, a -> Hit(section = section.id, paragraph = i - 1, before = b, match = m, after = a) }
                }
            }
        }
        return hits
    }

    private fun around(line: String, wanted: String, hits: MutableList<Hit>, hit: (String, String, String) -> Hit) {
        val lower = line.lowercase()
        var at = lower.indexOf(wanted)
        while (at >= 0 && hits.size < MOST_HITS) {
            val end = at + wanted.length
            val before = (if (at > AROUND) "…" else "") + line.substring(maxOf(0, at - AROUND), at)
            val after = line.substring(end, minOf(line.length, end + AROUND)) + (if (end + AROUND < line.length) "…" else "")
            hits += hit(before.replace('\n', ' '), line.substring(at, end), after.replace('\n', ' '))
            at = lower.indexOf(wanted, end)
        }
    }
}
