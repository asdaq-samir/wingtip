package app.wingtipmaps.android

import app.wingtipmaps.android.navigation.generated.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The site's links as the app reads them (Links): the web app's own
 *  address for a route or a field, and the sign-in link. */
class LinksTest {
    @Test
    fun aRoutesLinkGivesItsEndsAndStopsAsThePlannerReadsThem() {
        val link = Links.parse("https://wingtipmaps.app/app/plan?dep=kugn&dest=KMSN&stops=kjvl,%20krfd&aircraft=c172")
        assertEquals(Links.Route("KUGN", "KMSN", listOf("KJVL", "KRFD")), link)
    }

    @Test
    fun aRouteWithNoStopsHasNone() {
        assertEquals(Links.Route("KUGN", "KMSN", emptyList()), Links.parse("https://wingtipmaps.app/app/plan?dep=KUGN&dest=KMSN&stops="))
    }

    @Test
    fun aFieldsLinkOpensItsCard() {
        assertEquals(Links.Place("KORD"), Links.parse("https://wingtipmaps.app/app/plan?place=kord"))
    }

    @Test
    fun theSignInLinkGivesItsToken() {
        assertEquals(Links.SignIn("abc123"), Links.parse("https://wingtipmaps.app/api/auth/magic-link/verify?token=abc123", host = "wingtipmaps.app"))
    }

    /** M1: a sign-in link only as https on the app's own host, so another
     *  app's link cannot sign the pilot in to someone else's account. */
    @Test
    fun aSignInLinkElsewhereIsNoLink() {
        val host = "wingtipmaps.app"
        assertNull(Links.parse("https://evil.example/api/auth/magic-link/verify?token=abc123", host))
        assertNull(Links.parse("http://wingtipmaps.app/api/auth/magic-link/verify?token=abc123", host))
        assertNull(Links.parse("wingtipmaps://plan/api/auth/magic-link/verify?token=abc123", host))
        assertNull(Links.parse("https://wingtipmaps.app@evil.example/api/auth/magic-link/verify?token=abc123", host))
        assertNull(Links.parse("https://wingtipmaps.app.evil.example/api/auth/magic-link/verify?token=abc123", host))
        assertNull(Links.parse("https://wingtipmaps.app/x/api/auth/magic-link/verify?token=abc123", host))
        assertEquals(Links.SignIn("abc123"), Links.parse("https://WingtipMaps.app/api/auth/magic-link/verify?token=abc123", host))
    }

    @Test
    fun aScreenOpensByItsNameFromTheSiteOrTheAppsScheme() {
        assertEquals(Links.Open(Screen.LOGBOOK), Links.parse("https://wingtipmaps.app/app/plan?open=logbook"))
        assertEquals(Links.Open(Screen.NAVLOG), Links.parse("wingtipmaps://plan?open=NAVLOG"))
        assertNull(Links.parse("wingtipmaps://elsewhere?open=logbook"))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?open=nowhere"))
    }

    @Test
    fun aScreenBesideARouteOpensOnceTheRouteIsIn() {
        assertEquals(
            Links.Route("C81", "KDLH", emptyList(), Screen.BRIEF),
            Links.parse("https://wingtipmaps.app/app/plan?dep=C81&dest=KDLH&open=brief"),
        )
    }

    @Test
    fun anythingElseIsNoLink() {
        assertNull(Links.parse(null))
        assertNull(Links.parse(""))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan"))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?dep=KUGN"))
        assertNull(Links.parse("https://wingtipmaps.app/api/auth/magic-link/verify", host = "wingtipmaps.app"))
        assertNull(Links.parse("https://wingtipmaps.app/about"))
    }
}
