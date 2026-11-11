package app.wingtipmaps.android.api

import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.ConnectException
import java.net.SocketTimeoutException

/** What a failed call says on the screen (Problems): one plain sentence,
 *  never the socket's address and port, which go to the log. */
class ProblemsTest {
    @Test
    fun noConnectionSaysSoWithoutTheAddress() {
        val e = ConnectException("failed to connect to /10.0.2.2 (port 28443) from /10.0.2.16 (port 40822) after 10000ms")
        assertEquals("The chart could not be fetched: there is no connection to Wingtip.", Problems.words("The chart could not be fetched", e))
    }

    @Test
    fun aTimeoutIsNoConnectionToo() {
        assertEquals("KOSH could not be fetched: there is no connection to Wingtip.", Problems.words("KOSH could not be fetched", SocketTimeoutException("timeout")))
    }

    @Test
    fun aRefusalKeepsTheServersOwnWords() {
        val e = Gateway.Refusal(400, "That address is not valid.")
        assertEquals("The link could not be sent: That address is not valid.", Problems.words("The link could not be sent", e))
    }

    @Test
    fun aServerErrorSaysOnlyWhatFailed() {
        assertEquals("The brief could not be fetched.", Problems.words("The brief could not be fetched", Planner.Failure(502, "upstream at 10.0.0.4:8000 refused")))
    }

    @Test
    fun anyOtherFailureSaysOnlyWhatFailed() {
        assertEquals("The NOTAMs could not be fetched.", Problems.words("The NOTAMs could not be fetched", IllegalStateException("Unexpected JSON token at offset 12")))
    }
}
