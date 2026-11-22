package app.wingtipmaps.android

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** Settings' Extras: every parked feature off to start, in the web's keys,
 *  each switch kept as "extras.<key>" and read back on the next launch. */
class ExtrasTest {
    private val dir = createTempDirectory("extras").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "extras.preferences_pb") }

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun everyFeatureIsOffToStartInTheWebsOrderAndKeys() {
        val extras = Extras(Kept(store))
        assertEquals(listOf("atcCopilot", "adsbReceiver", "otherAirplanes", "modelWeather", "ask"), Extra.entries.map { it.key })
        assertEquals(emptySet<Extra>(), extras.on.value)
        Extra.entries.forEach { assertFalse(extras.isOn(it)) }
        // No store made yet in this process: off.
        assertFalse(Extras.now(Extra.ASK))
    }

    @Test
    fun aSwitchIsKeptAndReadBack() = runBlocking {
        val extras = Extras(Kept(store))
        extras.set(Extra.MODEL_WEATHER, true)
        assertTrue(extras.isOn(Extra.MODEL_WEATHER))
        assertFalse(extras.isOn(Extra.ATC_COPILOT))
        // Written behind, under its own key.
        val key = Extras.keyOf(Extra.MODEL_WEATHER)
        assertEquals("extras.modelWeather", key.name)
        repeat(50) { if (store.data.first()[key] == null) delay(20) }
        assertEquals(true, store.data.first()[key])
        assertEquals(setOf(Extra.MODEL_WEATHER), Extras(Kept(store)).on.value)

        extras.set(Extra.MODEL_WEATHER, false)
        assertFalse(extras.isOn(Extra.MODEL_WEATHER))
    }
}
