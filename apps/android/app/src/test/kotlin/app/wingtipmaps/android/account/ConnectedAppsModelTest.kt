package app.wingtipmaps.android.account

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.ConnectionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import java.time.ZoneOffset

/** Connected Apps (the deep security review's N2, the web's
 *  useConnectedApps): the list, Disconnect asked first and then ended, a
 *  connection already gone simply no longer listed, any other failure
 *  said in place. */
class ConnectedAppsModelTest {
    @get:Rule val main = MainRule()

    private val claude = ConnectionDto(app = "Claude", id = "c1", renewedAt = "2026-11-14T03:00:00Z")

    private class Fake(var connections: List<ConnectionDto>, val refuse: Exception? = null) : Connections {
        val ended = mutableListOf<String>()

        override suspend fun list() = connections

        override suspend fun disconnect(id: String) {
            refuse?.let { throw it }
            ended += id
            connections = connections.filterNot { it.id == id }
        }
    }

    @Test
    fun disconnectIsAskedFirstThenEndsTheConnection() {
        val source = Fake(listOf(claude))
        val model = ConnectedAppsModel(source)
        model.load()
        assertEquals(listOf(claude), model.state.value.connections)
        model.ask(claude)
        assertEquals(claude, model.state.value.asked)
        assertEquals(emptyList<String>(), source.ended)
        model.confirm()
        assertEquals(listOf("c1"), source.ended)
        assertNull(model.state.value.asked)
        assertEquals(emptyList<ConnectionDto>(), model.state.value.connections)
    }

    @Test
    fun aConnectionAlreadyGoneIsNoProblem() {
        val model = ConnectedAppsModel(Fake(emptyList(), refuse = Gateway.Refusal(404, null)))
        model.ask(claude)
        model.confirm()
        assertNull(model.state.value.problem)
    }

    @Test
    fun noConnectionIsSaidWhereTheListWouldBe() {
        val model = ConnectedAppsModel(object : Connections {
            override suspend fun list(): List<ConnectionDto> = throw IOException("offline")

            override suspend fun disconnect(id: String) = Unit
        })
        model.load()
        assertNotNull(model.state.value.problem)
        assertEquals("No connection. Your connected apps could not be read.", model.state.value.problem)
    }

    @Test
    fun lastUsedIsTheRenewalDate() {
        assertNotNull(ConnectedAppsModel.lastUsed(claude.renewedAt, ZoneOffset.UTC))
        assertNull(ConnectedAppsModel.lastUsed(null))
    }
}
