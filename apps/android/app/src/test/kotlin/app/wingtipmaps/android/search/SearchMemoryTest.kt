package app.wingtipmaps.android.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the search shows with nothing typed, kept on the phone. */
class SearchMemoryTest {
    private fun airport(ident: String) = Remembered(Remembered.Kind.AIRPORT, ident, ident.lowercase())

    @Test
    fun theLastPickedComesFirstOnce() {
        val one = SearchMemory.remembered(emptyList(), airport("KOSH"))
        val two = SearchMemory.remembered(one, airport("KMSN"))
        val again = SearchMemory.remembered(two, airport("kosh"))
        assertEquals(listOf("kosh", "KMSN"), again.map { it.ident })
    }

    @Test
    fun theOldestRecentsAreLetGo() {
        var recents = emptyList<Remembered>()
        repeat(SearchMemory.MAX_RECENTS + 3) { recents = SearchMemory.remembered(recents, airport("K00$it")) }
        assertEquals(SearchMemory.MAX_RECENTS, recents.size)
        assertEquals("K00${SearchMemory.MAX_RECENTS + 2}", recents.first().ident)
    }

    @Test
    fun aStarIsSetAndTakenAway() {
        val starred = SearchMemory.toggled(emptyList(), airport("KOSH"))
        assertEquals(listOf("KOSH"), starred.map { it.ident })
        assertEquals(emptyList<Remembered>(), SearchMemory.toggled(starred, airport("KOSH")))
    }

    @Test
    fun theStoreKeepsWhatItIsGiven() {
        val kept = mutableMapOf<String, String>()
        val memory = SearchMemory({ kept[it] }, { k, v -> kept[k] = v })
        memory.toggleFavorite(airport("C29"))
        memory.picked(airport("KJVL"))
        val again = SearchMemory({ kept[it] }, { k, v -> kept[k] = v })
        assertTrue(again.isFavorite("c29"))
        assertFalse(again.isFavorite("KJVL"))
        assertEquals(listOf("KJVL"), again.recents.value.map { it.ident })
    }
}
