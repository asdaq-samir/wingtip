package app.wingtipmaps.android.ai.functions

import app.wingtipmaps.android.Links
import app.wingtipmaps.android.navigation.generated.Screen
import org.junit.Assert.assertEquals
import org.junit.Test

/** An agent's links are the ones Links reads for a link tapped anywhere. */
class AgentLinksTest {
    @Test
    fun aScreenOpensByItsId() {
        assertEquals(Links.Open(Screen.EMERGENCY), Links.parse(AgentLinks.screen(Screen.EMERGENCY)))
    }

    @Test
    fun aRouteIsPlannedWithItsStops() {
        assertEquals(Links.Route("KPAO", "KSQL", listOf("OSI", "KHAF")), Links.parse(AgentLinks.route("KPAO", "KSQL", listOf("OSI", "KHAF"))))
    }

    @Test
    fun aFieldOpensItsCard() {
        assertEquals(Links.Place("KPAO"), Links.parse(AgentLinks.place("KPAO")))
    }
}
