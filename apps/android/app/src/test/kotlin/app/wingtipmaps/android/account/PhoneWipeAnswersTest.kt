package app.wingtipmaps.android.account

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.test.runTest
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetSocketAddress
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger

/** The deep security review of 2026-11-21: OkHttp's cache of the answers
 *  (Gateway.client) outlived sign-out and Delete Account, with the
 *  planner's answers asked at the pilot's points in it. The wipe empties it. */
class PhoneWipeAnswersTest {
    @Test
    fun theAnswersKeptAreGoneAfterTheWipe() = runTest {
        val asked = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/planner/airports/nearest") { exchange ->
            asked.incrementAndGet()
            val body = "{\"airports\":[]}".toByteArray()
            exchange.responseHeaders.add("Cache-Control", "max-age=600")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val cache = Cache(Files.createTempDirectory("answers").toFile(), 1L shl 20)
            val client = OkHttpClient.Builder().cache(cache).build()
            val url = "http://127.0.0.1:${server.address.port}/api/planner/airports/nearest?lat=42&lon=-88"
            fun ask() = client.newCall(Request.Builder().url(url).build()).execute().use { it.body.string() }

            ask()
            ask()
            assertEquals("kept, so asked once", 1, asked.get())

            assertTrue(PhoneWipe(listOf("answers kept" to PhoneWipe.answers(cache))).run().isEmpty())

            assertEquals(0L, cache.size())
            ask()
            assertEquals("asked again once forgotten", 2, asked.get())
        } finally {
            server.stop(0)
        }
    }
}
