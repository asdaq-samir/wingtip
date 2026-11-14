package app.wingtipmaps.android.search

import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.generated.AircraftProfileSummary
import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.api.generated.TrafficAircraft
import app.wingtipmaps.android.navigation.generated.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The one search's groups, as the canvas lists them for "osh". */
class SearchGroupsTest {
    private val archer = AircraftProfileSummary(cruiseTasKt = 125.0, fuelBurnGph = 9.5, name = "pa28", serviceCeilingFt = 14000.0, type = "Piper Archer")
    private val skyhawk = AircraftProfileSummary(cruiseTasKt = 122.0, fuelBurnGph = 8.4, name = "c172", serviceCeilingFt = 14000.0, type = "Cessna 172")

    @Test
    fun theFieldsComeBeforeTheFixesInTheirOwnGroups() {
        val found = listOf(
            AirportSuggestion(ident = "OSH", name = "OSHKOSH VORTAC 111.8", kind = "fix"),
            AirportSuggestion(ident = "KOSH", name = "Wittman Regional", municipality = "Oshkosh", region = "WI"),
        )
        val (airports, waypoints) = SearchGroups.split(found)
        assertEquals(listOf("KOSH"), airports.map { it.ident })
        assertEquals(listOf("OSH"), waypoints.map { it.ident })
    }

    @Test
    fun anNNumberIsAskedOfTheRegistry() {
        assertTrue(SearchGroups.looksLikeTail("N130SH"))
        assertTrue(SearchGroups.looksLikeTail("n 3429-j"))
        // 14 CFR 47.15(b): the first character after N is never zero.
        assertFalse(SearchGroups.looksLikeTail("N0123"))
        assertFalse(SearchGroups.looksLikeTail("KOSH"))
        assertFalse(SearchGroups.looksLikeTail("N123456"))
    }

    @Test
    fun theAirplanesAreThePilotsThenTheTypes() {
        val mine = OwnRecord(tail = "N3429J", type = "PA28")
        val hits = SearchGroups.airplanes("pa", listOf(mine), listOf(archer, skyhawk))
        assertEquals(listOf(AirplaneHit.Own(mine), AirplaneHit.Type(archer)), hits)
        assertEquals(listOf(AirplaneHit.Type(skyhawk)), SearchGroups.airplanes("cessna", emptyList(), listOf(archer, skyhawk)))
        assertEquals(emptyList<AirplaneHit>(), SearchGroups.airplanes(" ", listOf(mine), listOf(archer)))
    }

    @Test
    fun aRegisteredAirplaneOfThePilotsIsNotShownTwice() {
        val mine = OwnRecord(tail = "N3429J", type = "PA28")
        assertTrue(SearchGroups.isOwn(AircraftRegistration(nNumber = "3429J"), listOf(mine)))
        assertFalse(SearchGroups.isOwn(AircraftRegistration(nNumber = "130SH"), listOf(mine)))
    }

    @Test
    fun theDoGroupEndsInTheQuestion() {
        // The Brief needs a route; the passenger briefing, by its title, does not.
        val noRoute = SearchGroups.actions("brief", routed = false, hasFix = false, first = null)
        assertEquals(listOf(DoAction.Open(Screen.PASSENGERS), DoAction.Ask("brief")), noRoute)
        val routed = SearchGroups.actions("brief", routed = true, hasFix = false, first = null)
        assertEquals(listOf(DoAction.Open(Screen.BRIEF), DoAction.Open(Screen.PASSENGERS), DoAction.Ask("brief")), routed)
    }

    @Test
    fun noQuestionWhereNoModelCanAnswer() {
        val actions = SearchGroups.actions("brief", routed = true, hasFix = false, first = null, asked = false)
        assertEquals(listOf(DoAction.Open(Screen.BRIEF), DoAction.Open(Screen.PASSENGERS)), actions)
    }

    @Test
    fun directToNeedsThePosition() {
        assertEquals(DoAction.DirectTo("KOSH"), SearchGroups.actions("osh", routed = false, hasFix = true, first = "KOSH").first())
        assertFalse(SearchGroups.actions("osh", routed = false, hasFix = false, first = "KOSH").any { it is DoAction.DirectTo })
    }

    @Test
    fun aScreenIsFoundByItsTitle() {
        val actions = SearchGroups.actions("emerg", routed = false, hasFix = false, first = null)
        assertTrue(DoAction.Open(Screen.EMERGENCY) in actions)
        assertEquals(DoAction.Ask("emerg"), actions.last())
    }

    /** The airplanes the map hears, found by callsign, registration or
     *  address from three letters (the web's useHeardHits), a whole name first. */
    @Test
    fun anAirplaneHeardIsFoundByItsCallsignRegistrationOrAddress() {
        val sky = TrafficAircraft(hex = "a1b2c3", lat = 0.0, lon = 0.0, callsign = "SKW5501 ", registration = "N501SK")
        val ual = TrafficAircraft(hex = "ab1234", lat = 0.0, lon = 0.0, callsign = "UAL12", registration = "N12UA")
        val ua = TrafficAircraft(hex = "ab9999", lat = 0.0, lon = 0.0, callsign = "UAL1")
        val heard = listOf(sky, ual, ua)
        assertEquals(listOf(sky), SearchGroups.heard("skw", heard).map { it.plane })
        assertEquals(listOf(sky), SearchGroups.heard("N501-SK", heard).map { it.plane })
        assertEquals(listOf(ual), SearchGroups.heard("AB12", heard).map { it.plane })
        assertEquals(listOf(ua, ual), SearchGroups.heard("UAL1", heard).map { it.plane })
        assertTrue(SearchGroups.heard("ab", heard).isEmpty())
    }

    /** Show Traffic, where Traffic Nearby was, only while the traffic is off. */
    @Test
    fun showTrafficIsOfferedWhileTheTrafficIsOff() {
        assertTrue(DoAction.ShowTraffic in SearchGroups.actions("show tr", routed = false, hasFix = false, first = null, trafficOn = false))
        assertTrue(DoAction.ShowTraffic in SearchGroups.actions("traffic", routed = false, hasFix = false, first = null, trafficOn = false))
        assertFalse(DoAction.ShowTraffic in SearchGroups.actions("traffic", routed = false, hasFix = false, first = null, trafficOn = true))
        assertFalse(DoAction.ShowTraffic in SearchGroups.actions("brief", routed = false, hasFix = false, first = null, trafficOn = false))
    }

    /** The airplanes' Favorites and Recents after the airports'. */
    @Test
    fun theAirportsComeBeforeTheAirplanes() {
        val plane = Remembered(Remembered.Kind.AIRPLANE, "N12345")
        val field = Remembered(Remembered.Kind.AIRPORT, "KOSH")
        assertEquals(listOf(field, plane), SearchGroups.airportsFirst(listOf(plane, field)))
        val own = OwnRecord(tail = "N9876A", type = "pa28")
        assertEquals(listOf("KOSH", "N12345", "N9876A"), SearchGroups.starred(listOf(plane, field), listOf(own)).map { it.ident })
    }
}
