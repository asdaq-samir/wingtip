package app.wingtipmaps.android.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The gateway's refusal in its own words, from the problem detail it
 *  answers now and from the older error body. */
class GatewayWordsTest {
    @Test
    fun aProblemDetailReadsItsDetail() {
        assertEquals("No pilot is signed in.", Gateway.words("""{"type":"about:blank","title":"Unauthorized","status":401,"detail":"No pilot is signed in."}"""))
    }

    @Test
    fun aValidationProblemReadsItsDetailWhichNamesEachField() {
        val body = """{"status":400,"detail":"Invalid request: email: must be valid; name: must not be blank","errors":["email: must be valid","name: must not be blank"]}"""
        assertEquals("Invalid request: email: must be valid; name: must not be blank", Gateway.words(body))
    }

    @Test
    fun errorsAloneAreJoined() {
        assertEquals("email: must be valid; name: must not be blank", Gateway.words("""{"errors":["email: must be valid","name: must not be blank"]}"""))
    }

    @Test
    fun theOldBodyIsStillRead() {
        assertEquals("Bad input: a; b", Gateway.words("""{"error":"Bad input","details":["a","b"]}"""))
        assertEquals("Bad input", Gateway.words("""{"error":"Bad input"}"""))
    }

    @Test
    fun aBodyWithNoWordsIsNull() {
        assertNull(Gateway.words("not json"))
        assertNull(Gateway.words("{}"))
    }
}
