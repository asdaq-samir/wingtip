package app.wingtipmaps.android.api

import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** L9: the session cookie kept sealed, and a plain store moved over once. */
class SealedShelfTest {
    /** A stand-in for the Keystore's: reversible, and never the plain text. */
    private val seal = object : Seal {
        override fun seal(plain: String) = "sealed:" + plain.reversed()

        override fun open(sealed: String) = sealed.removePrefix("sealed:").takeIf { it != sealed }?.reversed()
    }

    @Test
    fun aPlainStoreIsMovedOverOnce() {
        val read = SealedShelf.readFrom(sealed = null, plain = "[]", seal = seal)
        assertEquals("[]", read.text)
        assertTrue(read.migrate)
    }

    @Test
    fun theSealedOneIsReadAndALeftoverPlainOneRemoved() {
        assertEquals(SealedShelf.Read("[1]", migrate = false), SealedShelf.readFrom(seal.seal("[1]"), null, seal))
        // A plain copy beside a sealed one (a write cut short): the sealed one
        // stands, the plain one goes.
        assertEquals(SealedShelf.Read("[1]", migrate = true), SealedShelf.readFrom(seal.seal("[1]"), "[0]", seal))
    }

    @Test
    fun aSealThatNoLongerOpensIsSignedOutNotReadPlain() {
        val read = SealedShelf.readFrom("garbage", null, seal)
        assertNull(read.text)
        assertFalse(read.migrate)
    }

    @Test
    fun theJarWritesOnlyThroughItsShelf() {
        val shelf = object : CookieShelf {
            var text: String? = null

            override fun read() = text

            override fun write(text: String) {
                this.text = text
            }
        }
        val url = "https://wingtipmaps.app/api/me".toHttpUrl()
        val session = Cookie.Builder().name("SESSION").value("abc").domain("wingtipmaps.app").path("/")
            .expiresAt(System.currentTimeMillis() + 86_400_000).secure().httpOnly().build()
        CookieStore(shelf).saveFromResponse(url, listOf(session))
        assertTrue(shelf.text!!.contains("SESSION"))
        // A new jar on the same shelf, as at the next launch.
        assertEquals(listOf("abc"), CookieStore(shelf).loadForRequest(url).map { it.value })
    }
}
