package app.wingtipmaps.android.share

import app.wingtipmaps.android.Links
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A shared flight's link (design/screens.json `shared`), written and read
 *  back: never a route planned by itself, the N-number only when sent. */
class SharedLinkTest {
    private val plan = SharedPlan(
        dep = "KMSN",
        dest = "KOSH",
        stops = listOf("KJVL", "KUES"),
        altitudeFt = 3500,
        depart = "2026-11-10T15:00:00Z",
        type = "C172",
        rules = "vfr",
    )

    @Test
    fun aPlansLinkIsTheSitesAddressWithTheSharedScreen() {
        assertEquals(
            "https://wingtipmaps.app/app/plan?open=shared&dep=KMSN&dest=KOSH&stops=KJVL,KUES&altitude_ft=3500" +
                "&depart=2026-11-10T15%3A00%3A00Z&type=C172&rules=vfr",
            plan.link("https://wingtipmaps.app"),
        )
    }

    @Test
    fun whatIsNotKnownIsLeftOff() {
        assertEquals("https://h/app/plan?open=shared&dep=KMSN&dest=KOSH", SharedPlan("KMSN", "KOSH").link("https://h"))
    }

    @Test
    fun aSharedLinkIsReadBackAsAPreview_notARoute() {
        assertEquals(Links.Shared(plan, null), Links.parse(plan.link("https://wingtipmaps.app")))
    }

    @Test
    fun theNumberGoesOnlyWhenSent() {
        val sent = plan.copy(tail = "N123AB")
        assertEquals(Links.Shared(sent, null), Links.parse(sent.link("https://wingtipmaps.app")))
    }

    @Test
    fun aSavedFlightsShareIsReadByItsToken() {
        assertEquals(
            Links.Shared(null, "abcdefghijklmnopqrstuv"),
            Links.parse("https://wingtipmaps.app/app/plan?open=shared&share=abcdefghijklmnopqrstuv"),
        )
    }

    @Test
    fun aSharedLinkWithNoRouteOrTokenIsNothing() {
        assertNull(Links.parse("https://wingtipmaps.app/app/plan?open=shared&dep=KMSN"))
    }

    @Test
    fun anOddAltitudeOrTimeIsLeftOut() {
        val read = Links.parse("wingtipmaps://plan?open=shared&dep=KMSN&dest=KOSH&altitude_ft=high&depart=soon&rules=spvfr") as Links.Shared
        assertEquals(SharedPlan("KMSN", "KOSH"), read.plan)
    }
}
