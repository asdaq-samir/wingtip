package app.wingtipmaps.android

import org.junit.Assert.assertEquals
import org.junit.Test

/** M1: a sign-in link is asked first, naming the account it signs in to
 *  and the one it would replace. */
class SignInAskTest {
    @Test
    fun namesTheAddressAsked() {
        assertEquals("Sign in to Wingtip Maps as pilot@example.com?", SignInAsk("t", "pilot@example.com", null).question())
    }

    @Test
    fun saysWhenThisPhoneAskedForNone() {
        assertEquals(
            "Sign in to Wingtip Maps with this link? This phone did not ask for one: go on only if you did.",
            SignInAsk("t", null, null).question(),
        )
    }

    @Test
    fun namesTheSessionItWouldReplace() {
        assertEquals(
            "Sign in to Wingtip Maps as b@example.com? You will be signed out of a@example.com.",
            SignInAsk("t", "b@example.com", "a@example.com").question(),
        )
        assertEquals("Sign in to Wingtip Maps as a@example.com?", SignInAsk("t", "a@example.com", "A@example.com").question())
    }
}
