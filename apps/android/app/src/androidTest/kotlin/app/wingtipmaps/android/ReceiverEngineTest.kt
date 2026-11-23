package app.wingtipmaps.android

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.receiverNexrad
import app.wingtipmaps.android.engine.generated.receiverRead
import app.wingtipmaps.android.engine.generated.receiverReports
import app.wingtipmaps.android.engine.generated.receiverTraffic
import app.wingtipmaps.android.receiver.HeldPicture
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The cockpit receiver's GDL 90 read on the phone, through the generated bridge
 * and the generated types, against the shared fixture
 * (apps/web/src/lib/fixtures/gdl90.json, this test APK's assets): the
 * picture, the traffic merged into the planner's TrafficAircraft, a
 * field's FIS-B reports and the NEXRAD; and the same read with the picture
 * held by the engine (HeldPicture), answering only what changed.
 */
@RunWith(AndroidJUnit4::class)
class ReceiverEngineTest {
    private val fixture: JsonObject = Json.parseToJsonElement(
        InstrumentationRegistry.getInstrumentation().context.assets.open("gdl90.json").bufferedReader().use { it.readText() },
    ).jsonObject

    private fun bytes(hex: String) = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun picture(): EngineContract.ReceiverPicture {
        var picture: EngineContract.ReceiverPicture? = null
        for (d in fixture["datagrams"]!!.jsonArray) {
            val o = d.jsonObject
            val data = Base64.encodeToString(bytes(o["hex"]!!.jsonPrimitive.content), Base64.NO_WRAP)
            picture = Engine.receiverRead(data, o["at"]!!.jsonPrimitive.double, picture).getOrThrow()
        }
        return picture!!
    }

    @Test
    fun theStreamReadsAndItsViewsAreTheFixtures() {
        val p = picture()
        assertEquals("Sentry", p.receiver.name)
        assertEquals(listOf("ab4549"), p.targets.map { it.hex })
        assertEquals("N12345", p.ownship?.callsign)

        val reports = fixture["reports"]!!.jsonObject
        val answer = Engine.receiverReports(p, reports["ident"]!!.jsonPrimitive.content).getOrThrow()
        assertEquals(reports["metar"]!!.jsonPrimitive.content, answer.metar?.text)
        assertEquals(reports["taf"]!!.jsonPrimitive.content, answer.taf?.text)

        val internet = listOf(TrafficAircraft(altitudeFt = 4500.0, callsign = "UAL1", hex = "c0ffee", lat = 42.0, lon = -88.0, seenS = 3.0))
        val heard = internet.map { Engine.json.decodeFromString<EngineContract.HeardPlane>(Engine.json.encodeToString(it)) }
        val at = fixture["datagrams"]!!.jsonArray[1].jsonObject["at"]!!.jsonPrimitive.double
        val merged = Engine.receiverTraffic(p, heard, 3200.0, at).getOrThrow()
            .map { Engine.json.decodeFromString<TrafficAircraft>(Engine.json.encodeToString(it)) }
        assertEquals(listOf("ab4549", "c0ffee"), merged.map { it.hex })
        // 5,000 ft pressure altitude; own ship 3,200 ft by GPS at 3,000 ft.
        assertEquals(5200.0, merged[0].altitudeFt!!, 0.0)

        val nexrad = Engine.receiverNexrad(p).getOrThrow()
        assertEquals(listOf(3.0, 5.0), nexrad.levels.filter { it.rects.isNotEmpty() }.map { it.level })
    }

    /** The picture held by the engine between reads: each read answers the
     *  small part as receiver_read's whole picture has it, a revision moves
     *  only with what changed, and the views asked of the held picture are
     *  the rules' answers over the whole one. */
    @Test
    fun theHeldPictureAnswersWhatChanged() {
        val whole = picture()
        HeldPicture().use { held ->
            var delta: EngineContract.ReceiverDeltaAnswer? = null
            for (d in fixture["datagrams"]!!.jsonArray) {
                val o = d.jsonObject
                delta = held.read(bytes(o["hex"]!!.jsonPrimitive.content), o["at"]!!.jsonPrimitive.double).getOrThrow()
            }
            val read = delta!!
            assertEquals(whole.receiver, read.receiver)
            assertEquals(whole.ownship, read.ownship)
            assertEquals(whole.targets, read.targets)
            assertEquals(whole.texts.size, read.texts)
            assertEquals(whole.nexrad.size, read.blocks)
            assertEquals(Engine.receiverNexrad(whole).getOrThrow(), held.nexrad().getOrThrow())
            val ident = fixture["reports"]!!.jsonObject["ident"]!!.jsonPrimitive.content
            assertEquals(Engine.receiverReports(whole, ident).getOrThrow(), held.reports(ident).getOrThrow())
            val at = fixture["datagrams"]!!.jsonArray[1].jsonObject["at"]!!.jsonPrimitive.double
            val again = held.read(ByteArray(0), at).getOrThrow()
            assertEquals(read.trafficRevision, again.trafficRevision)
            assertEquals(read.nexradRevision, again.nexradRevision)
            assertTrue(held.traffic(emptyList(), null, at).getOrThrow().isNotEmpty())
        }
        // A new held picture starts empty: the receiver turned off lets go.
        HeldPicture().use { assertNull(it.read(ByteArray(0), 0.0).getOrThrow().receiver.heartbeatAt) }
    }
}
