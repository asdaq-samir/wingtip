package app.wingtipmaps.android.api

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.Response

/** A generated call's answer read as the hand-written calls read theirs:
 *  the planner's refusal in its "detail", the gateway's in its words, a
 *  read signed out as null. */
class AnswersTest {
    private val json = "application/json".toMediaType()

    private fun <T : Any> refused(code: Int, body: String): Response<T> = Response.error(code, body.toResponseBody(json))

    @Test
    fun thePlannersAnswerOrItsWords() {
        assertEquals("KOSH", Response.success("KOSH").planned())
        val failed = assertThrows(Planner.Failure::class.java) { refused<String>(422, """{"detail":"No such field"}""").planned() }
        assertEquals(422, failed.status)
        assertEquals("No such field", failed.detail)
        assertNull(refused<String>(404, "{}").plannedOrNone())
    }

    @Test
    fun theGatewaysAnswerOrItsWords() {
        assertEquals("ok", Response.success("ok").accepted())
        val refusal = assertThrows(Gateway.Refusal::class.java) {
            refused<String>(400, """{"error":"Invalid request","details":["phone: too long"]}""").accepted()
        }
        assertEquals(400, refusal.status)
        assertEquals("Invalid request: phone: too long", refusal.words)
        Response.success(Unit).done()
        assertThrows(Gateway.Refusal::class.java) { refused<Unit>(502, "{}").done() }
    }

    @Test
    fun aReadSignedOutIsNobodys() {
        assertNull(refused<String>(401, "").readOrNone())
        assertNull(refused<String>(404, "").readOrNone(none = setOf(204, 404)))
        assertThrows(Gateway.Refusal::class.java) { refused<String>(500, "").readOrNone() }
        assertEquals("me", Response.success("me").readOrNone())
    }
}
