package app.wingtipmaps.android.receiver

import android.content.Context
import android.net.wifi.WifiManager
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.SocketTimeoutException

/**
 * The cockpit's ADS-B receiver heard on the Wi-Fi: GDL 90 sent to UDP
 * port 4000 (Garmin's GDL 90 Data Interface Specification), as Stratux,
 * Sentry, Garmin's GDL 39 and 52 and uAvionix's receivers send it to the
 * phones that join them, to each phone or to the network's broadcast
 * address. The datagrams are only gathered here, on a thread of their
 * own; the engine reads them (`receiver_read`, Receiver). The Wi-Fi's
 * multicast lock lets the broadcast ones through, which Android filters
 * out otherwise to save the battery.
 */
class ReceiverSocket(private val context: Context) {
    private val lock = Any()
    private val gathered = ByteArrayOutputStream()
    @Volatile private var socket: DatagramSocket? = null
    private var thread: Thread? = null
    private var multicast: WifiManager.MulticastLock? = null

    /** Why the socket could not be opened, for the setting's row. */
    @Volatile var problem: String? = null
        private set

    fun start() {
        synchronized(lock) {
            if (socket != null) return
            try {
                val s = DatagramSocket(null).apply {
                    reuseAddress = true
                    broadcast = true
                    soTimeout = TIMEOUT_MS
                    bind(InetSocketAddress(PORT))
                }
                socket = s
                problem = null
                val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                multicast = wifi?.createMulticastLock("wingtip-receiver")?.apply { setReferenceCounted(false); acquire() }
                thread = Thread({ listen(s) }, "wingtip-receiver").apply { isDaemon = true; start() }
            } catch (e: Exception) {
                problem = e.message ?: e.toString()
            }
        }
    }

    fun stop() {
        synchronized(lock) {
            socket?.close()
            socket = null
            thread = null
            multicast?.release()
            multicast = null
            gathered.reset()
        }
    }

    /** The bytes gathered since the last call. */
    fun drain(): ByteArray = synchronized(lock) {
        val bytes = gathered.toByteArray()
        gathered.reset()
        bytes
    }

    private fun listen(s: DatagramSocket) {
        val buffer = ByteArray(MAX_DATAGRAM)
        while (!s.isClosed) {
            val packet = DatagramPacket(buffer, buffer.size)
            try {
                s.receive(packet)
            } catch (e: SocketTimeoutException) {
                continue
            } catch (e: Exception) {
                break
            }
            synchronized(lock) {
                // A stalled reader drops what came first, stale by then.
                if (gathered.size() + packet.length > MOST) gathered.reset()
                gathered.write(packet.data, packet.offset, packet.length)
            }
        }
    }

    companion object {
        /** GDL 90's port over Wi-Fi, as the receivers and ForeFlight use it. */
        const val PORT = 4000
        private const val TIMEOUT_MS = 1_000
        /** Larger than any GDL 90 datagram (an uplink frame is 436 bytes
         *  before its escapes). */
        private const val MAX_DATAGRAM = 8_192
        /** The most kept between two reads. */
        private const val MOST = 512 * 1024
    }
}
