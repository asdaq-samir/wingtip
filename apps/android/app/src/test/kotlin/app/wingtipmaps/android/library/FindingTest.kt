package app.wingtipmaps.android.library

import app.wingtipmaps.android.api.generated.CfrGroup
import app.wingtipmaps.android.api.generated.CfrSection
import app.wingtipmaps.android.api.generated.CfrText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** How the reader finds its way (Finding), held to the web's pdfPlaces
 *  and textSearch cases: a paragraph's row of the outline, and every
 *  place a search finds. */
class FindingTest {
    private val aim = listOf(
        OutlineRow("Chapter 7. Safety of Flight", 400, 0),
        OutlineRow("7-1-5. Preflight Briefings", 412, 1),
        OutlineRow("7–1–50. Something Later", 450, 1),
    )

    @Test
    fun anAimParagraphIsFoundInTheOutlineNotALongerNumber() {
        assertEquals(412, Finding.rowFor(aim, "7-1-5")?.page)
        // The AIM sets its numbers with en dashes; the cite writes hyphens.
        assertEquals(450, Finding.rowFor(aim, "7-1-50")?.page)
        assertNull(Finding.rowFor(aim, "7-1-6"))
        assertEquals("7-1-5.", Finding.headingWords("7-1-5"))
    }

    @Test
    fun aBookmarkIsNamedByTheSectionItIsIn() {
        assertEquals("7-1-5. Preflight Briefings", Finding.titleAt(aim, 420))
        assertNull(Finding.titleAt(aim, 12))
    }

    @Test
    fun aPdfsPagesAreSearchedInOrderTheirCaseAside() {
        val hits = Finding.inPages(listOf("Nothing here.", "VFR weather minimums, and vfr again."), "vfr")
        assertEquals(listOf(2, 2), hits.map { it.page })
        assertEquals("VFR", hits[0].match)
        assertTrue(hits[0].after.startsWith(" weather"))
        assertEquals(emptyList<Hit>(), Finding.inPages(listOf("a"), "a"))
    }

    @Test
    fun aCfrPartIsSearchedBySectionAndParagraph() {
        val part = CfrText(
            head = "PART 91",
            groups = listOf(
                CfrGroup(
                    head = "Subpart B",
                    sections = listOf(CfrSection(id = "91.155", head = "§ 91.155 Basic VFR weather minimums.", paragraphs = listOf("(a) Except as provided in paragraph (b) of this section, no person may operate an aircraft under VFR."))),
                ),
            ),
        )
        val hits = Finding.inPart(part, "VFR")
        assertEquals(listOf("91.155", "91.155"), hits.map { it.section })
        // The heading first (-1), then the paragraph.
        assertEquals(listOf(-1, 0), hits.map { it.paragraph })
    }
}
