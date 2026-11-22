package app.wingtipmaps.android

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.receiverPosition
import app.wingtipmaps.android.engine.generated.receiverRead
import app.wingtipmaps.android.flight.OwnShipSource
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Own ship from each supported receiver as the phone asks the engine
 * (`receiver_position`), through the generated bridge and types, against
 * the shared fixture (apps/web/src/lib/fixtures/gdl90-receivers.json, this
 * test APK's assets); then OwnShipSource taking the receiver's fix and
 * letting it go.
 */
@RunWith(AndroidJUnit4::class)
class ReceiverPositionTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val fixture: JsonObject = Json.parseToJsonElement(
        InstrumentationRegistry.getInstrumentation().context.assets.open("gdl90-receivers.json").bufferedReader().use { it.readText() },
    ).jsonObject
    private val samples = fixture["receivers"]!!.jsonArray.map { it.jsonObject }

    private fun bytes(hex: String) = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun read(sample: JsonObject, at: Double) =
        Engine.receiverRead(Base64.encodeToString(bytes(sample["hex"]!!.jsonPrimitive.content), Base64.NO_WRAP), at, null).getOrThrow()

    @Test
    fun eachReceiverIsWeighedAsTheEngineSays() {
        val at = fixture["at"]!!.jsonPrimitive.double
        for (sample in samples) {
            val who = sample["receiver"]!!.jsonPrimitive.content
            val expect = sample["expect"]!!.jsonObject
            val picture = read(sample, at)
            val answer = Engine.receiverPosition(picture.ownship, picture.receiver, null, "device", at).getOrThrow()
            assertEquals(who, expect["source"]!!.jsonPrimitive.content, answer.source)
            assertEquals(who, expect["receiver"]!!.jsonPrimitive.content, answer.receiver)
            expect["altitude_ft"]?.let { assertEquals(who, it.jsonPrimitive.doubleOrNull, answer.fix?.altitudeFt) }
            expect["ellipsoid_ft"]?.let { assertEquals(who, it.jsonPrimitive.doubleOrNull, answer.fix?.ellipsoidFt) }
        }
    }

    @Test
    fun ownShipTakesTheReceiversFixAndLetsItGo() = runBlocking {
        val sentry = samples.first { it["receiver"]!!.jsonPrimitive.content == "sentry" }
        val picture = read(sentry, AppClock.nowMs() / 1000.0)
        val source = OwnShipSource(context)
        // A tablet with no fix of its own: the Sentry's.
        val shown = source.receiver(picture.ownship, picture.receiver)
        assertTrue(shown is OwnShipSource.Next.Show)
        assertEquals(3200.0, (shown as OwnShipSource.Next.Show).fix.altitudeFt)
        assertEquals(OwnShipSource.Kind.RECEIVER, source.weighed.value?.kind)
        // The receiver turned off with no device fix: no position at all.
        assertEquals(OwnShipSource.Next.Clear, source.receiver(null, null))
        assertNull(source.weighed.value)
    }
}
