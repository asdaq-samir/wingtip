package app.wingtipmaps.android.alternate

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The alternate filed beside the plan: asked of the nav log under IFR
 *  only, and only for the destination it was filed for, as the web's
 *  address carries it. */
class PlanAlternateTest {
    @After
    fun takeOff() = PlanAlternate.file("KMSN", null)

    @Test
    fun underIfrTheOneFiledForTheDestination() {
        PlanAlternate.file("kmsn", " krfd ")
        assertEquals(PlanAlternate.Filed("KMSN", "KRFD"), PlanAlternate.filed.value)
        assertEquals("KRFD", PlanAlternate.of("ifr", "KMSN"))
        assertEquals(mapOf("alternate" to "KRFD"), PlanAlternate.query("ifr", "KMSN"))
    }

    @Test
    fun noneUnderVfrOrForAnotherDestination() {
        PlanAlternate.file("KMSN", "KRFD")
        // 91.169 is an IFR rule: no alternate leg, no alternate fuel.
        assertNull(PlanAlternate.of("vfr", "KMSN"))
        // A new destination: the last flight's alternate is not this one's.
        assertNull(PlanAlternate.of("ifr", "KDLH"))
        assertEquals(mapOf("alternate" to null), PlanAlternate.query("ifr", "KDLH"))
    }

    @Test
    fun takenOff() {
        PlanAlternate.file("KMSN", "KRFD")
        PlanAlternate.file("KMSN", null)
        assertNull(PlanAlternate.filed.value)
        assertNull(PlanAlternate.of("ifr", "KMSN"))
    }

    @Test
    fun landsAfterTheTimeEnRoute() {
        assertEquals("2026-11-10T15:30:00Z", PlanAlternate.landsAt("2026-11-10T14:00:00Z", 90.0, 0L))
        assertEquals("1970-01-01T01:00:00Z", PlanAlternate.landsAt(null, 60.0, 0L))
        // No airplane, no time en route: no ETA, and nothing guessed.
        assertNull(PlanAlternate.landsAt("2026-11-10T14:00:00Z", null, 0L))
    }
}
