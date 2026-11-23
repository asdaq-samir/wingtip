package app.wingtipmaps.android.receiver

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** When the receiver's picture goes through the engine: each second while
 *  bytes come or its airplanes can still go stale, once a minute once only
 *  the FIS-B products are left, never before a receiver is heard. When
 *  Traffic merges again is the engine's traffic revision
 *  (ReceiverEngineTest, and the engine's held tests). */
class ReceiverAgeingTest {
    private fun picture(live: Boolean, heartbeatAt: Double? = 100.0, targets: Int = 0) = EngineContract.ReceiverDeltaAnswer(
        receiver = EngineContract.ReceiverState(
            stratux = true, heartbeatAt = heartbeatAt, live = live, summary = "Stratux", gps = true, utcOk = true,
            batteryLow = false, maintenance = false, msl = true, frames = 10.0, badFrames = 0.0,
        ),
        targets = List(targets) {
            EngineContract.ReceiverTarget(
                hex = "ab4549", address = 11_224_393.0, addressType = 0.0, source = "adsb", lat = 42.0, lon = -88.0,
                airborne = true, extrapolated = false, trackKind = "true", emitter = 1.0, emergency = 0.0, nic = 8.0, nacp = 9.0,
                alert = false, at = 100.0 + it,
            )
        },
        texts = 3,
        blocks = 1,
        trafficRevision = 1,
        textsRevision = 1,
        nexradRevision = 1,
    )

    @Test
    fun aQuietReceiverIsAgedEachSecondOnlyWhileItsAirplanesCanStillGoStale() {
        // Never heard: nothing to read; bytes: always.
        assertFalse(Receiver.due(null, heard = false, sinceMs = 1_000))
        assertTrue(Receiver.due(null, heard = true, sinceMs = 0))
        // Gone quiet, the link still live or an airplane still held: each second.
        assertTrue(Receiver.due(picture(live = true), heard = false, sinceMs = 1_000))
        assertTrue(Receiver.due(picture(live = false, targets = 1), heard = false, sinceMs = 1_000))
        // Only the FIS-B products left: once a minute.
        assertFalse(Receiver.due(picture(live = false), heard = false, sinceMs = 1_000))
        assertTrue(Receiver.due(picture(live = false), heard = false, sinceMs = Receiver.QUIET_EVERY_MS))
    }
}
