package app.wingtipmaps.android

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** What was a SharedPreferences file, now a DataStore read at once: a
 *  change is there to read the moment it is made, and on the file after. */
class KeptTest {
    private val dir = createTempDirectory("kept").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val file = File(dir, "plan.preferences_pb")
    private val store = PreferenceDataStoreFactory.create(scope = io) { file }

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun aChangeIsReadAtOnceAndWrittenBehind() = runBlocking {
        val kept = Kept(store)
        assertNull(kept[KEY])
        kept.edit { it[KEY] = "KOSH" }
        assertEquals("KOSH", kept[KEY])
        assertTrue(KEY in kept)
        // Written behind, in order.
        repeat(50) { if (store.data.first()[KEY] == null) delay(20) }
        assertEquals("KOSH", store.data.first()[KEY])
    }

    @Test
    fun removeAndClearTakeEffectAtOnce() {
        val kept = Kept(store)
        kept.edit {
            it[KEY] = "KMSN"
            it[ON] = true
        }
        kept.edit { it.remove(KEY) }
        assertNull(kept[KEY])
        assertEquals(true, kept[ON])
        kept.edit { it.clear() }
        assertFalse(ON in kept)
    }

    private companion object {
        val KEY = stringPreferencesKey("kept")
        val ON = booleanPreferencesKey("on")
    }
}
