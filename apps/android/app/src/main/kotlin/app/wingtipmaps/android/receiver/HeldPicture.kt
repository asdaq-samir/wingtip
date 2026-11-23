package app.wingtipmaps.android.receiver

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.ffi.ReceiverSession
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.encodeToString
import java.nio.Buffer
import java.nio.ByteBuffer

/**
 * A receiver's picture held by the engine between reads (the engine's
 * ReceiverSession, engine/bindings/ffi), the twin of the iOS app's
 * HeldPicture: each second only the bytes heard go over, and only the
 * receiver, own ship, its traffic and a revision of the FIS-B texts and
 * NEXRAD come back (`receiver_delta`), so the hundreds of kB of FIS-B the
 * picture keeps never cross. The traffic merged, a field's reports and the
 * NEXRAD are asked of it when the screens want them. The session's own
 * lock guards the picture, so any thread may ask; closed, the engine lets
 * the picture go (a call already under way finishes first).
 */
class HeldPicture : AutoCloseable {
    private val session = ReceiverSession()

    /** The bytes heard read into the picture at [atS], Unix s. */
    fun read(bytes: ByteArray, atS: Double): Result<EngineContract.ReceiverDeltaAnswer> =
        Engine.held("receiver_delta") {
            // The engine borrows the bytes for the call from a direct
            // buffer, as packVerify does (CyclePacks).
            val direct = ByteBuffer.allocateDirect(bytes.size).put(bytes)
            (direct as Buffer).flip()
            session.read(direct, atS)
        }

    /** The traffic to draw, the receiver's airplanes first and then the
     *  internet's it does not hear (`receiver_traffic`). */
    fun traffic(internet: List<EngineContract.HeardPlane>, ownFt: Double?, atS: Double): Result<List<EngineContract.HeardPlane>> =
        Engine.held("receiver_traffic") { session.traffic(Engine.json.encodeToString(internet), ownFt, atS) }

    /** A field's METAR and TAF as FIS-B sent them (`receiver_reports`). */
    fun reports(ident: String): Result<EngineContract.ReceiverReportsAnswer> = Engine.held("receiver_reports") { session.reports(ident) }

    /** The NEXRAD as rectangles of each level (`receiver_nexrad`). */
    fun nexrad(): Result<EngineContract.ReceiverNexradAnswer> = Engine.held("receiver_nexrad") { session.nexrad() }

    override fun close() = session.close()
}
