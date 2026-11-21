package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.AircraftRegistration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Play app names an FAA registrant only on the pilot's own airplane
 *  or where the registry types it as an organisation; anyone else is their
 *  kind and state (RegistryNames, App Review 5.1.1(viii)). */
class RegistryNamesTest {
    private val person = AircraftRegistration(
        nNumber = "N3429J", owner = "SMITH JOHN Q", ownerType = "Individual", city = "Madison", state = "WI",
        coOwners = 1, coOwnerNames = listOf("SMITH JANE"),
    )

    @Test
    fun aPersonsAirplaneIsTheirKindAndStateOnly() {
        assertEquals("Individual, WI", RegistryNames.owner(person, own = false))
        assertNull(RegistryNames.town(person, own = false))
        assertEquals("1", RegistryNames.coOwners(person, own = false))
    }

    @Test
    fun thePilotsOwnAirplaneIsNamed() {
        assertEquals("SMITH JOHN Q", RegistryNames.owner(person, own = true))
        assertEquals("Madison, WI", RegistryNames.town(person, own = true))
        assertEquals("SMITH JANE", RegistryNames.coOwners(person, own = true))
    }

    @Test
    fun organisationsAreNamedAndPeopleAndPartnershipsAreNot() {
        listOf("Corporation", "Government", "LLC", "Non-citizen corporation").forEach { assertTrue(it, RegistryNames.named(it, own = false)) }
        listOf("Individual", "Partnership", "Co-owned", "Non-citizen co-owned", null).forEach { assertFalse("$it", RegistryNames.named(it, own = false)) }
        val club = AircraftRegistration(nNumber = "N3429J", owner = "LAKE SUPERIOR FLYING CLUB", ownerType = "Corporation", city = "Duluth", state = "MN")
        assertEquals("LAKE SUPERIOR FLYING CLUB", RegistryNames.owner(club, own = false))
        assertEquals("Duluth, MN", RegistryNames.town(club, own = false))
    }

    @Test
    fun aWithheldNameAndAMissingKindSayWhatIsKnown() {
        assertNull(RegistryNames.owner(AircraftRegistration(nNumber = "N1", ownerType = "Individual", state = "TX"), own = false))
        assertEquals("Private owner, CA", RegistryNames.owner(AircraftRegistration(nNumber = "N2", owner = "DOE J", country = "CA"), own = false))
    }

    @Test
    fun pastOwnersAndReservationsNameOnlyWhatMayBeNamed() {
        assertEquals("Individual, IA", RegistryNames.pastOwner("Individual", "DOE JANE", "Ames", "IA"))
        assertEquals("N123 LLC · Ames, IA", RegistryNames.pastOwner("LLC", "N123 LLC", "Ames", "IA"))
        assertEquals("IA", RegistryNames.reservedBy("DOE JANE", "Ames", "IA", own = false))
        assertEquals("DOE JANE · Ames, IA", RegistryNames.reservedBy("DOE JANE", "Ames", "IA", own = true))
    }
}
