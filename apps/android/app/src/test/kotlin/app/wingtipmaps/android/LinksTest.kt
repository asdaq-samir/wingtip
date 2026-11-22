package app.wingtipmaps.android

import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.share.SharedPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The site's links as the app reads them (Links): the web app's own
 *  address for a route or a field, and the sign-in link. */
class LinksTest {
    /** N3, 2026-11-21: any page or app can open a route link, so it is
     *  previewed as a shared flight is, never planned over the pilot's own. */
    @Test
    fun aRoutesLinkIsPreviewedWithItsEndsAndStopsAsThePlannerReadsThem() {
        val link = Links.parse("https://wingtipmaps.app/app/plan?dep=kugn&dest=KMSN&stops=kjvl,%20krfd&aircraft=c172")
        assertEquals(Links.Shared(SharedPlan("KUGN", "KMSN", listOf("KJVL", "KRFD")), null), link)
        assertEquals(Links.Shared(SharedPlan("C81", "KDLH"), null), Links.parse("wingtipmaps://plan?dep=C81&dest=KDLH"))
    }

    @Test
    fun aRouteWithNoStopsHasNone() {
        assertEquals(Links.Shared(SharedPlan("KUGN", "KMSN"), null), Links.parse("https://wingtipmaps.app/app/plan?dep=KUGN&dest=KMSN&stops="))
    }

    @Test
    fun aFieldsLinkOpensItsCard() {
        assertEquals(Links.Place("KORD"), Links.parse("https://wingtipmaps.app/app/plan?place=kord"))
    }

    /** The documents library's place, the web's `doc` key (DocPlace). */
    @Test
    fun aDocumentsLinkOpensTheReaderAtItsPlace() {
        assertEquals(Links.Doc("cfr-14-91@91.155"), Links.parse("https://wingtipmaps.app/app/plan?doc=cfr-14-91%4091.155"))
        assertEquals(Links.Doc("aim@7-1-5"), Links.parse("wingtipmaps://plan?doc=aim@7-1-5"))
        assertEquals(Links.Place("KORD"), Links.parse("https://wingtipmaps.app/app/plan?doc=../etc&place=kord"))
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
    fun aScreenBesideARouteIsNotOpenedOverThePreview() {
        assertEquals(
            Links.Shared(SharedPlan("C81", "KDLH"), null),
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

    /** The deep security review of 2026-11-21: URLDecoder throws on a bad
     *  escape, and any page or app can send such a link, which closed the
     *  app. The bad part is left out and the rest read. */
    @Test
    fun aLinkWithABadEscapeIsReadWithoutIt() {
        assertNull(Links.parse("wingtipmaps://plan?x=%"))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?dep=%zz&dest=KMSN"))
        assertEquals(
            Links.Shared(SharedPlan("KUGN", "KMSN"), null),
            Links.parse("https://wingtipmaps.app/app/plan?dep=KUGN&dest=KMSN&junk=%E0%A4%A"),
        )
        assertNull(Links.parse("https://wingtipmaps.app/api/auth/magic-link/verify?token=%", host = "wingtipmaps.app"))
    }
}
