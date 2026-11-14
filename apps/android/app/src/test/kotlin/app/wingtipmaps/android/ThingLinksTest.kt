package app.wingtipmaps.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A TFR's and a VOR's own links (Links.tfrLink, navaidLink), read back
 *  as the cards they open, as the web's address.test holds its own. */
class ThingLinksTest {
    private val origin = "https://wingtipmaps.app"

    @Test
    fun aTfrsLinkOpensItsCardAndIsReadBack() {
        val link = Links.tfrLink("6/4116", origin)
        assertEquals("https://wingtipmaps.app/app/plan?tfr=6%2F4116", link)
        assertEquals(Links.Tfr("6/4116"), Links.parse(link))
    }

    @Test
    fun aFieldsIdentIsNoTfr() {
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?tfr=KORD"))
    }

    @Test
    fun aVorsLinkCarriesItsIdentAndPlaceToFourPlaces() {
        val link = Links.navaidLink("OBK", 42.22141, -87.95168, origin)
        assertEquals("https://wingtipmaps.app/app/plan?navaid=OBK%4042.2214%2C-87.9517", link)
        assertEquals(Links.Navaid("OBK", 42.2214, -87.9517), Links.parse(link))
    }

    @Test
    fun aVorWithNoPlaceOrNoIdentOpensNoCard() {
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?navaid=OBK"))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?navaid=@42.2,-87.9"))
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?navaid=OBK@142.2,-87.9"))
    }

    @Test
    fun aRouteStillWinsOverAThingsCard() {
        assertEquals(Links.Route("KUGN", "KMSN", emptyList()), Links.parse("https://wingtipmaps.app/app/plan?dep=KUGN&dest=KMSN&tfr=6/4116"))
    }
}
